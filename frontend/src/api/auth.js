import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '';

const API = axios.create({ baseURL: `${API_BASE}/api` });

// Перехватчик — добавляет токен, если есть
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Перехватчик ответа — автоматический рефреш токена при 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (original.url?.includes('/auth/refresh') || original.url?.includes('/auth/login')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return API(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('afina_user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken });
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        processQueue(null, data.token);
        original.headers.Authorization = `Bearer ${data.token}`;
        return API(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('afina_user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth endpoints ───────────────────────
export const authAPI = {
  login:          (data) => API.post('/auth/login', data),
  verify2fa:      (data) => API.post('/auth/verify-2fa', data),
  resend2fa:      (data) => API.post('/auth/resend-2fa', data),
  register:       (data) => API.post('/auth/register', data),
  registerLegal:  (data) => API.post('/auth/register-legal', data),
  refresh:        (data) => API.post('/auth/refresh', data),
  logout:         (data) => API.post('/auth/logout', data),
  changePassword: (data) => API.put('/auth/change-password', data),
  loginHistory:   (params) => API.get('/auth/login-history', { params }),
  forgotPassword: (data) => API.post('/auth/forgot-password', data),
  resetPassword:  (data) => API.post('/auth/reset-password', data),
};

export default API;
