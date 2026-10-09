import API from './auth';

export const getUsers        = (params) => API.get('/admin/users', { params });
export const createUser      = (data)   => API.post('/admin/users', data);
export const deleteUser      = (id)     => API.delete(`/admin/users/${id}`);
export const changeUserRole  = (id, d)  => API.patch(`/admin/users/${id}/role`, d);
export const changeUserStatus= (id, d)  => API.patch(`/admin/users/${id}/status`, d);
export const updateUser      = (id, d)  => API.put(`/admin/users/${id}`, d);
export const getAuditLog     = (params) => API.get('/admin/audit', { params });
export const getAuditDetail  = (id)     => API.get(`/admin/audit/${id}`);
export const getAnalytics    = (params) => API.get('/admin/analytics', { params });
export const getFraudAlerts  = (params) => API.get('/fraud/alerts', { params });
export const getFraudDetail  = (id)     => API.get(`/fraud/alerts/${id}`);
export const resolveAlert    = (id, d)  => API.post(`/fraud/alerts/${id}/resolve`, d);
