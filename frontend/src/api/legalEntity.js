import API from './auth';

export const getLegalEmployees = () => API.get('/legal-entity/employees');
export const addLegalEmployee = (data) => API.post('/legal-entity/employees', data);
export const removeLegalEmployee = (id) => API.delete(`/legal-entity/employees/${id}`);

export const getSalaryAutopayRules = () => API.get('/legal-entity/salary-autopay');
export const createSalaryAutopayRule = (data) => API.post('/legal-entity/salary-autopay', data);
export const updateSalaryAutopayRule = (id, data) => API.put(`/legal-entity/salary-autopay/${id}`, data);
export const deleteSalaryAutopayRule = (id) => API.delete(`/legal-entity/salary-autopay/${id}`);
