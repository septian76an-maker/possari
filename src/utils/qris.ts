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
