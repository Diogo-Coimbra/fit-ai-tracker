import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  // Configuração inicial do pedido à Google
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '715283938816-l95uo27dqv3ke2cfqv3t93bef73tcf6s.apps.googleusercontent.com', // O ID antigo
    iosClientId: '715283938816-qv35s088tbu2npb5am41i76qmtkl986r.apps.googleusercontent.com', // <-- Cola o novo ID aqui (com aspas!)
  });

  // Este 'useEffect' fica à escuta. Quando a Google responde, ele acorda!
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      // Se o login correr bem, vamos ver o Token secreto no terminal
      console.log('✅ SUCESSO! Token da Google recebido:', authentication?.accessToken);
    }
  }, [response]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fit AI Tracker 🏋️‍♂️</Text>
      <Text style={styles.subtitle}>O teu PT Inteligente</Text>

      <TouchableOpacity 
        style={styles.button} 
        disabled={!request} // O botão fica inativo até a Google estar pronta
        onPress={() => promptAsync()} // O clique agora abre a janela da Google!
      >
        <Text style={styles.buttonText}>Entrar com o Google</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
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
    backgroundColor: '#4285F4',
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