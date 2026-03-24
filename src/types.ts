export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'cashier';
  name: string;
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  description?: string;
}

export interface InvoiceItem {
  serviceId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  items: InvoiceItem[];
  total: number;
  status: 'pending' | 'paid' | 'cancelled';
  type: 'invoice' | 'quotation';
  createdAt: string;
  createdBy: string;
  creatorName?: string;
  voucherCode?: string;
  discountAmount?: number;
}

export interface Voucher {
  id: string;
  name: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minPurchase?: number;
  maxDiscount?: number;
  startDate?: string;
  expiryDate?: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

export interface VoucherLog {
  id: string;
  voucherName: string;
  voucherCode: string;
  usedAt: string;
  cashierName: string;
  invoiceCode: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder?: string;
}

export interface AppSettings {
  appName: string;
  appLogo: string;
  appAddress: string;
  appPhone: string;
  appEmail: string;
  bankAccounts?: BankAccount[];
  theme?: 'default' | 'dark' | 'ocean';
}
