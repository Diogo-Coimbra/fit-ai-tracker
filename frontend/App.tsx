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
    scopes: ['profile', 'email', 'openid'], // OBRIGATÓRIO PARA TERMOS O ID TOKEN NO MODO WEB!
    responseType: 'id_token', // EXTREMAMENTE IMPORTANTE NO BROWSER: Forçar a Google a devolver diretamente o ID Token
  });

  // Este 'useEffect' fica à escuta. Quando a Google responde, ele acorda!
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      const idTokenFinal = authentication?.idToken || response.params?.id_token;
      
      // Se o login correr bem, vamos ver o Token secreto no terminal
      console.log('✅ SUCESSO! Access Token:', authentication?.accessToken);
      console.log('🔑 ID Token (o que vai para o backend):', idTokenFinal ? 'ENCONTRADO!' : 'NÃO VEIO!');

      // ❗ IMPORTANTE: Agora pegamos no token e enviamos "por correio" (POST) para o nosso Backend!
      if (idTokenFinal) {
        // ATENÇÃO: Se estiveres a testar num telemóvel físico (Expo Go), troca "localhost" pelo teu IP (ex: 192.168.1...:3000)
        // Se for o Emulador do Android, usa "10.0.2.2" em vez de "localhost"
        // NO BROWSER (Tecla W) PODE FICAR LOCALHOST!
        fetch('http://localhost:3000/api/auth/google', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: idTokenFinal }), // O nome "token" tem de ser igualzinho ao do req.body.token do backend!
        })
          .then((res) => res.json())
          .then((data) => console.log('🚀 Resposta do nosso Backend:', data))
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