import React from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

// 1. Recebemos o 'navigation' aqui
export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>O Meu Perfil 👤</Text>

      {user?.picture ? (
        <Image source={{ uri: user.picture }} style={styles.profileImage} />
      ) : (
        <View style={styles.placeholderImage} />
      )}
      
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      {/* 2. Novo botão para voltar ao Dashboard */}
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backButtonText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
        <Text style={styles.logoutText}>Sair da Conta (Logout)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', position: 'absolute', top: 60 },
  profileImage: { width: 120, height: 120, borderRadius: 60, marginBottom: 20, borderWidth: 2, borderColor: '#4285F4' },
  placeholderImage: { width: 120, height: 120, borderRadius: 60, marginBottom: 20, backgroundColor: '#333333' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  email: { fontSize: 16, color: '#aaaaaa', marginBottom: 40 },
  
  // Estilos do novo botão
  backButton: { backgroundColor: '#333333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center', marginBottom: 15 },
  backButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  logoutButton: { backgroundColor: '#ff4444', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center' },
  logoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});