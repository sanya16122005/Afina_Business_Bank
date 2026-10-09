import API from './auth';

// Сеансы
export const startSession    = (data)   => API.post('/cashier/sessions', data);
export const getSessionStatus= (sid)    => API.get(`/cashier/sessions/${sid}/status`);
export const endSession      = (sid, d) => API.post(`/cashier/sessions/${sid}/end`, d);
export const getSessionDeposits = (sid, params) => API.get(`/cashier/sessions/${sid}/deposits`, { params });
export const getSessionReport= (sid)    => API.get(`/cashier/sessions/${sid}/report`);
export const getCashierReportTransactions = (params) => API.get('/cashier/reports/transactions', { params });

// Клиенты
export const getClients      = (params) => API.get('/cashier/clients', { params });
export const getClient       = (id)     => API.get(`/cashier/clients/${id}`);
export const changeClientStatus = (id, data) => API.patch(`/cashier/clients/${id}/status`, data);
export const createClient    = (data)   => API.post('/cashier/clients', data);
export const updateClient    = (id, d)  => API.put(`/cashier/clients/${id}`, d);
export const deleteClient    = (id)     => API.delete(`/cashier/clients/${id}`);

// Счета
export const openAccount     = (data)   => API.post('/cashier/accounts', data);
export const updateCashierAccountDesign = (id, data) => API.put(`/cashier/accounts/${id}/design`, data);
export const changeAccountStatus = (id, data) => API.patch(`/cashier/accounts/${id}/status`, data);
export const closeAccount    = (id, d)  => API.delete(`/cashier/accounts/${id}`, { data: d });

// Операции
export const createDeposit   = (data)   => API.post('/cashier/transactions/deposit', data);
export const createWithdraw  = (data)   => API.post('/cashier/transactions/withdraw', data);
export const createTransfer  = (data)   => API.post('/cashier/transactions/transfer', data);

// Антифрод (кассирский доступ)
export const getFraudAlerts  = (params) => API.get('/fraud/alerts', { params });
export const resolveAlert    = (id, d)  => API.post(`/fraud/alerts/${id}/resolve`, d);
