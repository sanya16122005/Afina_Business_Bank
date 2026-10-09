import API from './auth';

export const getAccounts      = (params) => API.get('/accounts', { params });
export const getAccount       = (id)     => API.get(`/accounts/${id}`);
export const createAccount    = (data)   => API.post('/accounts', data);
export const updateAccountDesign = (id, data) => API.put(`/accounts/${id}/design`, data);
export const previewAccount   = (data)   => API.post('/accounts/preview', data);
export const lookupAccount    = (params) => {
	if (typeof params === 'string') {
		return API.get('/accounts/lookup', { params: { accountNumber: params } });
	}

	return API.get('/accounts/lookup', { params });
};
export const getDashboard     = ()       => API.get('/customer/dashboard');
export const getProfile       = ()       => API.get('/users/profile');
export const updateProfile    = (data)   => API.put('/users/profile', data);
export const updateSettings   = (data)   => API.put('/users/settings', data);
