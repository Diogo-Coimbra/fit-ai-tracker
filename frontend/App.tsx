import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
// 1. Importamos o nosso "Cérebro"
import { useAuthStore } from './store/useAuthStore'; 

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  // 2. Pedimos ao cérebro as variáveis e funções que precisamos
  const { user, isLoading, login, checkSession } = useAuthStore();

  // 3. Este useEffect corre APENAS UMA VEZ quando a app abre para ler o cofre
  useEffect(() => {
    checkSession();
  }, []);

  // Configuração inicial do pedido à Google
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '715283938816-l95uo27dqv3ke2cfqv3t93bef73tcf6s.apps.googleusercontent.com', 
    iosClientId: '715283938816-qv35s088tbu2npb5am41i76qmtkl986r.apps.googleusercontent.com',
    androidClientId: '715283938816-4hio2kbp5u27nifolr33ot4d1fr5s8m8.apps.googleusercontent.com',
    scopes: ['profile', 'email', 'openid'], 
    responseType: 'id_token', 
  });

  // Este 'useEffect' fica à escuta. Quando a Google responde, ele acorda!
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      const idTokenFinal = authentication?.idToken || response.params?.id_token;
      
      if (idTokenFinal) {
        fetch('http://192.168.1.80:3000/api/auth/google', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: idTokenFinal }), 
        })
          .then((res) => res.json())
          .then((data) => {
            console.log('🚀 Resposta do nosso Backend:', data);
            
            // 4. SE O BACKEND DISSER QUE ESTÁ TUDO BEM, GUARDAMOS NO COFRE!
            if (data.user) {
              login(data.user); // Isto guarda os dados e atualiza a app inteira
            }
          })
          .catch((err) => console.error('❌ Erro a enviar para o Backend:', err));
      }
    }
  }, [response]);

  // 5. Se a app ainda está a ler o cofre (isLoading), mostramos um ecrã de carga
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={{ color: '#aaaaaa', marginTop: 15 }}>A abrir o cofre...</Text>
      </View>
    );
  }

  // 6. Se já encontrámos um utilizador (no cofre ou acabou de fazer login)
  if (user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Bem-vindo de volta! 🎉</Text>
        <Text style={styles.subtitle}>{user.name}</Text>
        {/* Na US 9 vamos meter aqui o botão de Logout */}
      </View>
    );
  }

  // Se ninguém estiver logado, mostramos o ecrã original de Login
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fit AI Tracker 🏋️‍♂️</Text>
      <Text style={styles.subtitle}>O teu PT Inteligente</Text>

      <TouchableOpacity 
        style={styles.button} 
        disabled={!request} 
        onPress={() => promptAsync()} 
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
    textAlign: 'center',
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