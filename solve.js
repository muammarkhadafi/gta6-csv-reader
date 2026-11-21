// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly the same {columns, rows, errors} as the reference for every
// input, but reads the text with native indexOf/slice scans instead of one
// character at a time, so long fields are sliced, not built up a character at
// a time. Pure: no clock, no randomness, no locale, nothing kept from one
// call to the next.
//
// The reading policy, kept identical to the reference:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside it is
//     read as LF; what follows its closing quote, up to the next comma or line
//     break, is appended to it as it stands (quote_junk, when the field ends);
//     a quote that never closes is read as a literal character and the text
//     after it is read again as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside a quoted field counted), row its
//     record's index in rows (null for the header), in the order met.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;
  // The field just read: its value, how it ended, and how many characters
  // were kept after its prefix. The readers write these, never objects, so
  // the hot path allocates nothing per field.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // One segment of a quoted field: count its line breaks (every LF, CRLF and
  // lone CR inside it), turn each CRLF or lone CR into one LF, and add the
  // count to the current line. Returns the segment as it reads.
  function quotedSegment(seg) {
    const hasNl = seg.indexOf('\n');
    const hasCr = seg.indexOf('\r');
    if (hasNl === -1 && hasCr === -1) return seg;
    let count = 0;
    let i = -1;
    while ((i = seg.indexOf('\n', i + 1)) !== -1) count += 1;
    i = -1;
    while ((i = seg.indexOf('\r', i + 1)) !== -1) {
      if (seg.charCodeAt(i + 1) !== 10) count += 1;
    }
    line += count;
    if (hasCr === -1) return seg;
    return seg.replace(/\r\n?/g, '\n');
  }

  // Reads an unquoted field from pos, with `prefix` already in its value (the
  // quoted value for junk, '"' for an unterminated quote, '' otherwise).
  // Writes fValue, fEnded and fAdded; fAdded counts the characters kept
  // after the prefix. A CR not followed by LF inside it is dropped, one
  // stray_cr error each, and the field goes on.
  function readUnquoted(prefix) {
    const iComma = text.indexOf(',', pos);
    const iNl = text.indexOf('\n', pos);
    let end;
    let isComma;
    if (iComma === -1 && iNl === -1) {
      end = -1;
    } else if (iComma === -1) {
      end = iNl;
      isComma = false;
    } else if (iNl === -1) {
      end = iComma;
      isComma = true;
    } else if (iComma < iNl) {
      end = iComma;
      isComma = true;
    } else {
      end = iNl;
      isComma = false;
    }

    if (end === -1) {
      // The rest of the text: every CR in it is stray (no LF follows it here).
      let tail = text.slice(pos);
      if (tail.indexOf('\r') !== -1) {
        let out = '';
        let i = 0;
        let c;
        while ((c = tail.indexOf('\r', i)) !== -1) {
          error('stray_cr');
          out += tail.slice(i, c);
          i = c + 1;
        }
        out += tail.slice(i);
        tail = out;
      }
      fValue = prefix + tail;
      fAdded = fValue.length - prefix.length;
      pos = n;
      fEnded = END;
      return;
    }

    const span = text.slice(pos, end);
    const cr = span.indexOf('\r');
    if (cr === -1) {
      fValue = prefix + span;
      fAdded = fValue.length - prefix.length;
      pos = end + 1;
      if (isComma) {
        fEnded = COMMA;
        return;
      }
      line += 1;
      fEnded = LINE_BREAK;
      return;
    }
    if (!isComma && cr === span.length - 1) {
      // The CR is the first half of the CRLF that ends the record.
      fValue = prefix + span.slice(0, -1);
      fAdded = fValue.length - prefix.length;
      pos = end + 1;
      line += 1;
      fEnded = LINE_BREAK;
      return;
    }
    // Stray CRs inside the span: drop each with an error, keep the field.
    const parts = [prefix];
    let i = 0;
    let c;
    while ((c = span.indexOf('\r', i)) !== -1) {
      if (c === span.length - 1 && !isComma) {
        // A trailing CR before the LF that ends the record: CRLF, no error.
        parts.push(span.slice(i, c));
        fValue = parts.join('');
        fAdded = fValue.length - prefix.length;
        pos = end + 1;
        line += 1;
        fEnded = LINE_BREAK;
        return;
      }
      error('stray_cr');
      parts.push(span.slice(i, c));
      i = c + 1;
    }
    parts.push(span.slice(i));
    fValue = parts.join('');
    fAdded = fValue.length - prefix.length;
    pos = end + 1;
    if (isComma) {
      fEnded = COMMA;
      return;
    }
    line += 1;
    fEnded = LINE_BREAK;
  }

  // Reads a quoted field whose opening quote is at pos. Writes fValue,
  // fEnded and fAdded (0 unless junk followed the closing quote).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let segStart = pos + 1;
    let parts = null; // segments plus the '"' of each "" escape; null while one clean segment
    let scan = segStart;
    while (true) {
      const q = text.indexOf('"', scan);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field goes on.
        if (parts === null) parts = [];
        parts.push(quotedSegment(text.slice(segStart, q)), '"');
        scan = q + 2;
        segStart = q + 2;
        continue;
      }
      // The closing quote.
      const seg = quotedSegment(text.slice(segStart, q));
      const value = parts === null ? seg : parts.join('') + seg;
      pos = q + 1;
      if (pos >= n) {
        fValue = value;
        fAdded = 0;
        fEnded = END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fAdded = 0;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fAdded = 0;
        fEnded = LINE_BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fAdded = 0;
        fEnded = LINE_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      readUnquoted(value);
      if (fAdded > 0) error('quote_junk');
      return;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
