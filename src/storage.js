// Adaptador de armazenamento local — substitui o window.storage do Claude
// Mesma interface (get/set assíncronos) para rodar em qualquer navegador / hospedagem.
const storage = {
  async get(key) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? { key, value } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },
  async delete(key) {
    try {
      localStorage.removeItem(key);
      return { key, deleted: true };
    } catch (e) {
      return null;
    }
  },
};

export default storage;
