import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { useSessionStore } from '@/core/context/SessionStore';

// v1.1.1 - Multiple payments, CC fee breakdown, order warnings
const API_BASE_URL = 'https://ndc-production.up.railway.app/api';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

// Add CORRECT Jetstar headers on every request
api.interceptors.request.use((config) => {
  const { auth, credentials } = useSessionStore.getState();
  
  if (auth?.token) {
    // CORRECT headers matching Postman
    config.headers['Authorization'] = `Bearer ${auth.token}`;
    config.headers['Ocp-Apim-Subscription-Key'] = credentials?.subscriptionKey || '';
    config.headers['NDCUAT'] = 'Jetstar3.12';  // HARDCODED
    config.headers['Content-Type'] = 'application/xml';
    config.headers['Accept'] = 'application/xml';
    config.headers['X-NDC-Environment'] = auth.environment || 'UAT';
  }
  
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useSessionStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export { api };

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.response?.data?.error?.message || error.message || 'Error';
  }
  return error instanceof Error ? error.message : 'Unknown error';
}
