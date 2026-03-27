import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../store/useAuthStore'; // Nota os dois pontos (..) para sair da pasta screens

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '715283938816-l95uo27dqv3ke2cfqv3t93bef73tcf6s.apps.googleusercontent.com', 
    iosClientId: '715283938816-qv35s088tbu2npb5am41i76qmtkl986r.apps.googleusercontent.com',
    androidClientId: '715283938816-4hio2kbp5u27nifolr33ot4d1fr5s8m8.apps.googleusercontent.com',
    scopes: ['profile', 'email', 'openid'], 
    responseType: 'id_token', 
  });

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
            if (data.user) {
              login(data.user); // Apenas guardamos no cofre. O App.tsx trata do resto!
            }
          })
          .catch((err) => console.error('❌ Erro a enviar para o Backend:', err));
      }
    }
  }, [response]);

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
  container: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 18, color: '#aaaaaa', marginBottom: 50 },
  button: { backgroundColor: '#4285F4', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});