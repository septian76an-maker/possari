import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  printInvoice: (data: any) => ipcRenderer.invoke('print-invoice', data),
  sendEmail: (data: any) => ipcRenderer.invoke('send-email', data),
  // You can add more APIs here
});
