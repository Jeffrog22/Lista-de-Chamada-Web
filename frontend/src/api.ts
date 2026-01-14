import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

// Attach token if present
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token && config.headers) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

export const getStudents = () => API.get("/students");
export const getAttendance = () => API.get("/attendance");
export const importFile = (fileName: string) => API.post(`/import?file=${encodeURIComponent(fileName)}&out_clean=true`);
export const login = (username: string, password: string) =>
  API.post("/token", new URLSearchParams({ username, password }), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

export default API;