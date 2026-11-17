let adminSessionActive = false;
export function setAdminSession() { adminSessionActive = true; }
export function hasAdminSession() { return adminSessionActive; }
export function clearAdminSession() { adminSessionActive = false; }
