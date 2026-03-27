import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// 1. Importamos o cérebro e os nossos novos ecrãs
import { useAuthStore } from './store/useAuthStore';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';

// 2. Criamos o "Gestor de Rotas"
const Stack = createNativeStackNavigator();

export default function App() {
  const { user, isLoading, checkSession } = useAuthStore();

  // 3. Lê o cofre quando a app abre
  useEffect(() => {
    checkSession();
  }, []);

  // 4. Mostra o ecrã de carga enquanto lê o cofre
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  // 5. A magia da navegação protegida!
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          // ROTA PRIVADA: Só entra quem tem sessão
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
        ) : (
          // ROTA PÚBLICA: Para quem precisa de entrar
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
});