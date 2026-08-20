// Helper: Calculate CRC16 CCITT for standard EMVCo QRIS
export function calculateCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function formatTLV(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

// Parse EMVCo / QRIS string to extract tags (Merchant Name tag 59, NMID tag 26/51 subtag 01/02, City tag 60, etc.)
export function parseEMVCoQRIS(qrisString: string): {
  merchantName?: string;
  nmid?: string;
  city?: string;
  postalCode?: string;
  amount?: number;
  currency?: string;
} {
  const result: {
    merchantName?: string;
    nmid?: string;
    city?: string;
    postalCode?: string;
    amount?: number;
    currency?: string;
  } = {};

  if (!qrisString || typeof qrisString !== 'string') return result;

  const raw = qrisString.trim();
  let index = 0;

  while (index < raw.length - 4) {
    const tag = raw.substring(index, index + 2);
    const lengthStr = raw.substring(index + 2, index + 4);
    const length = parseInt(lengthStr, 10);

    if (isNaN(length) || length <= 0 || index + 4 + length > raw.length) {
      break;
    }

    const value = raw.substring(index + 4, index + 4 + length);

    if (tag === '59') {
      // Merchant Name
      result.merchantName = value.trim();
    } else if (tag === '60') {
      // Merchant City
      result.city = value.trim();
    } else if (tag === '61') {
      // Postal Code
      result.postalCode = value.trim();
    } else if (tag === '54') {
      // Amount
      const num = parseFloat(value);
      if (!isNaN(num)) result.amount = num;
    } else if (tag === '53') {
      result.currency = value.trim();
    } else if ((parseInt(tag, 10) >= 26 && parseInt(tag, 10) <= 51)) {
      // Tags 26-51 contain sub-TLVs for Merchant Account Information (NMID, Acquirer ID, etc.)
      let subIndex = 0;
      while (subIndex < value.length) {
        const subTag = value.substring(subIndex, subIndex + 2);
        const subLengthStr = value.substring(subIndex + 2, subIndex + 4);
        const subLength = parseInt(subLengthStr, 10);
        if (isNaN(subLength) || subLength <= 0 || subIndex + 4 + subLength > value.length) {
          break;
        }
        const subValue = value.substring(subIndex + 4, subIndex + 4 + subLength);
        if (subTag === '01' || subTag === '02' || subTag === '03') {
          if (subValue.toUpperCase().startsWith('ID') || /^[0-9A-Z]{9,25}$/i.test(subValue)) {
            result.nmid = subValue.trim();
          }
        }
        subIndex += 4 + subLength;
      }
    }

    // Move to next TLV
    index += 4 + length;
  }

  // Regex fallback if TLV parse didn't find NMID or Merchant
  if (!result.nmid) {
    const nmidMatch = raw.match(/ID[0-9]{9,18}/i);
    if (nmidMatch) {
      result.nmid = nmidMatch[0].toUpperCase();
    }
  }

  return result;
}

// Convert a merchant's real static QRIS string into a dynamic QRIS with an exact amount
export function convertStaticQRISToDynamic(staticQris: string, amount: number, invoiceId?: string): string {
  if (!staticQris || typeof staticQris !== 'string' || !staticQris.trim().startsWith('000201')) {
    return '';
  }

  let raw = staticQris.trim();

  // Strip existing CRC (Tag 63 and its 4-character checksum at the end)
  const crcIndex = raw.lastIndexOf('6304');
  if (crcIndex !== -1 && crcIndex >= raw.length - 8) {
    raw = raw.substring(0, crcIndex);
  }

  // Parse TLVs to rebuild with Dynamic Point of Initiation (Tag 01 = 12) and Amount (Tag 54)
  let index = 0;
  const tags: Array<{ tag: string; value: string }> = [];

  while (index < raw.length) {
    const tag = raw.substring(index, index + 2);
    const lengthStr = raw.substring(index + 2, index + 4);
    const length = parseInt(lengthStr, 10);

    if (isNaN(length) || length <= 0 || index + 4 + length > raw.length) {
      break;
    }

    const value = raw.substring(index + 4, index + 4 + length);

    // Skip Tag 54 (Amount), Tag 55 (Tip indicator), Tag 56 (Fee), Tag 57 (Fee amount), Tag 63 (CRC)
    if (tag !== '54' && tag !== '55' && tag !== '56' && tag !== '57' && tag !== '63') {
      if (tag === '01') {
        // Change point of initiation to '12' (Dynamic)
        tags.push({ tag: '01', value: '12' });
      } else {
        tags.push({ tag, value });
      }
    }

    index += 4 + length;
  }

  // Construct rebuilt string
  let rebuilt = '';
  let amountInserted = false;

  for (const item of tags) {
    // Insert Tag 54 (Amount) right after Currency (Tag 53)
    if (item.tag === '58' && !amountInserted) {
      const amountStr = Math.round(amount).toString();
      rebuilt += formatTLV('54', amountStr);
      amountInserted = true;
    }

    rebuilt += formatTLV(item.tag, item.value);
  }

  if (!amountInserted) {
    const amountStr = Math.round(amount).toString();
    rebuilt += formatTLV('54', amountStr);
  }

  // Add CRC tag header
  rebuilt += '6304';
  const checksum = calculateCRC16(rebuilt);
  return `${rebuilt}${checksum}`;
}

// Generate valid standard Indonesian QRIS dynamic payload with specific amount
export function generateDynamicQRIS(params: {
  merchantName?: string;
  nmid?: string;
  invoiceId: string;
  amount: number;
  city?: string;
  postalCode?: string;
}): string {
  const merchantNameClean = (params.merchantName || 'MERCHANT QRIS').toUpperCase().slice(0, 25);
  const cityClean = (params.city || 'INDONESIA').toUpperCase().slice(0, 15);
  const postal = params.postalCode || '10110';
  const nmidClean = params.nmid || 'ID1020000000000';

  // Sub-tags for Merchant Account Information (Tag 26)
  const tag26Sub00 = formatTLV('00', 'ID.CO.QRIS.WWW');
  const tag26Sub01 = formatTLV('01', nmidClean);
  const tag26Sub02 = formatTLV('02', '00000');
  const tag26Sub03 = formatTLV('03', 'UME');
  const tag26 = formatTLV('26', `${tag26Sub00}${tag26Sub01}${tag26Sub02}${tag26Sub03}`);

  // Sub-tags for Additional Data Field (Tag 62)
  const tag62Sub01 = formatTLV('01', params.invoiceId.slice(0, 20));
  const tag62Sub07 = formatTLV('07', 'A01');
  const tag62 = formatTLV('62', `${tag62Sub01}${tag62Sub07}`);

  let raw = '';
  raw += formatTLV('00', '01'); // Format Indicator
  raw += formatTLV('01', '12'); // Point of Initiation (12 = Dynamic QR with amount)
  raw += tag26;                 // Merchant Account Information
  raw += formatTLV('51', formatTLV('00', 'ID.CO.QRIS.WWW') + formatTLV('02', nmidClean));
  raw += formatTLV('52', '5812'); // Merchant Category Code
  raw += formatTLV('53', '360');  // Currency: IDR (360)
  raw += formatTLV('54', Math.round(params.amount).toString()); // Transaction Amount
  raw += formatTLV('58', 'ID');   // Country Code
  raw += formatTLV('59', merchantNameClean); // Merchant Name
  raw += formatTLV('60', cityClean);         // Merchant City
  raw += formatTLV('61', postal);            // Postal Code
  raw += tag62;                              // Additional Data Field
  raw += '6304';                             // CRC Tag Header

  const checksum = calculateCRC16(raw);
  return `${raw}${checksum}`;
}
