import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id?: string;
  name: string;
  email: string;
  picture?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (userData: User) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  // AÇÃO DE LOGIN
  login: async (userData) => {
    try {
      // Guardamos no cofre que funciona na Web!
      await AsyncStorage.setItem('user_session', JSON.stringify(userData));
      // E só depois avisamos a app para mudar o ecrã
      set({ user: userData });
    } catch (error) {
      console.error("Erro ao guardar sessão:", error);
    }
  },

  // AÇÃO DE LOGOUT
  logout: async () => {
    try {
      await AsyncStorage.removeItem('user_session');
      set({ user: null });
    } catch (error) {
      console.error("Erro ao apagar sessão:", error);
    }
  },

  // AÇÃO DE INICIALIZAÇÃO
  checkSession: async () => {
    try {
      const sessionData = await AsyncStorage.getItem('user_session');
      if (sessionData) {
        set({ user: JSON.parse(sessionData), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error("Erro ao ler sessão:", error);
      set({ isLoading: false });
    }
  }
}));