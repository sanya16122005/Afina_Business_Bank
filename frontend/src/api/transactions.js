import API from './auth';

export const getTransactions = (params) => API.get('/transactions', { params });
export const createTransfer  = (data)   => API.post('/transactions/transfer', data);
export const getTransaction  = (id)     => API.get(`/transactions/${id}`);
