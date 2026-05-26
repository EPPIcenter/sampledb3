import axios from 'axios'

/** Shared axios instance for all domain API modules. */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})
