import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      {/* Títulos da App */}
      <Text style={styles.title}>Fit AI Tracker 🏋️‍♂️</Text>
      <Text style={styles.subtitle}>O teu PT Inteligente</Text>

      {/* Botão de Login do Google */}
      <TouchableOpacity 
        style={styles.button} 
        onPress={() => console.log('O utilizador clicou no botão do Google!')}
      >
        <Text style={styles.buttonText}>Entrar com o Google</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212', // Fundo escuro profissional
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#aaaaaa',
    marginBottom: 50,
  },
  button: {
    backgroundColor: '#4285F4', // Azul oficial da Google
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    elevation: 3,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});