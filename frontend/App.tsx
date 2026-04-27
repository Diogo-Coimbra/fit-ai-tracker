import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// 1. Importamos o cérebro e os nossos novos ecrãs
import { useAuthStore } from './store/useAuthStore';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProfileScreen from './screens/ProfileScreen';
import CreateWorkoutScreen from './screens/CreateWorkoutScreen';
import WorkoutDetailsScreen from './screens/WorkoutDetailsScreen';
import AddExerciseScreen from './screens/AddExerciseScreen';
import AIGeneratorScreen from './screens/AIGeneratorScreen';
import EditExerciseScreen from './screens/EditExerciseScreen';
import HistoryScreen from './screens/HistoryScreen';

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
       // ROTA PRIVADA: Adicionámos um Fragment (<> </>) para agrupar os dois ecrãs
       <>
         <Stack.Screen name="Dashboard" component={DashboardScreen} />
         <Stack.Screen name="Profile" component={ProfileScreen} />
         <Stack.Screen name="CreateWorkout" component={CreateWorkoutScreen} />
         <Stack.Screen name="WorkoutDetails" component={WorkoutDetailsScreen} />
         <Stack.Screen name="AddExercise" component={AddExerciseScreen} />
         <Stack.Screen name="AIGenerator" component={AIGeneratorScreen} />
         <Stack.Screen name="EditExercise" component={EditExerciseScreen} />
         <Stack.Screen name="History" component={HistoryScreen} />
       </>
     ) : (
       // ROTA PÚBLICA
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