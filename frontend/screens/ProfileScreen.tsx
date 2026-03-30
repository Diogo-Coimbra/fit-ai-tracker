import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Platform, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/useAuthStore';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  
  const [profilePic, setProfilePic] = useState(user?.picture);
  const [imageError, setImageError] = useState(false);

  // NOVOS ESTADOS: Para a edição do nome
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(user?.name || '');
  const [displayName, setDisplayName] = useState(user?.name || '');

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setProfilePic(result.assets[0].uri);
      setImageError(false);
      
      console.log('✅ Nova foto escolhida:', result.assets[0].uri);
      if (Platform.OS === 'web') alert('Foto alterada no ecrã! (Será guardada na BD no Sprint 9)');
    }
  };

  // FUNÇÃO NOVA: Guardar o nome
  const handleSaveName = () => {
    if (!tempName.trim()) {
      if (Platform.OS === 'web') alert('O nome não pode estar vazio!');
      return;
    }
    
    setDisplayName(tempName); // Atualiza o nome visível
    setIsEditingName(false); // Fecha o modo de edição
    
    console.log('✏️ Novo nome definido localmente:', tempName);
    if (Platform.OS === 'web') {
      alert(`Nome alterado para "${tempName}" no ecrã! (Vamos ligar à base de dados no Sprint 9)`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>O Meu Perfil 👤</Text>

      <TouchableOpacity onPress={pickImage} style={styles.imageContainer} activeOpacity={0.8}>
        {profilePic && !imageError ? (
          <Image 
            source={{ uri: profilePic }} 
            style={styles.profileImage} 
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>👤</Text>
          </View>
        )}
        <View style={styles.editBadge}>
          <Text style={styles.editBadgeText}>✏️</Text>
        </View>
      </TouchableOpacity>
      
      {/* ZONA DO NOME: Condicional (Modo Leitura vs Modo Edição) */}
      {isEditingName ? (
        <View style={styles.editNameContainer}>
          <TextInput 
            style={styles.nameInput}
            value={tempName}
            onChangeText={setTempName}
            autoFocus
            placeholder="O teu novo nome..."
            placeholderTextColor="#666"
          />
          <TouchableOpacity style={styles.saveNameBtn} onPress={handleSaveName}>
            <Text style={styles.saveNameText}>✅</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.nameDisplayContainer} onPress={() => setIsEditingName(true)}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.editNameIcon}>✏️</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.email}>{user?.email}</Text>

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
  
  imageContainer: { position: 'relative', marginBottom: 20 },
  profileImage: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#4285F4' },
  placeholderImage: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#333333', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#555' },
  placeholderText: { fontSize: 50 },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#4285F4', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#121212' },
  editBadgeText: { fontSize: 16 },

  // NOVOS ESTILOS: Para a zona do nome
  nameDisplayContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  name: { fontSize: 22, fontWeight: 'bold', color: '#ffffff' },
  editNameIcon: { fontSize: 16, marginLeft: 8, opacity: 0.7 },
  
  editNameContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, width: '80%' },
  nameInput: { flex: 1, backgroundColor: '#1e1e1e', color: '#ffffff', padding: 10, borderRadius: 8, fontSize: 18, borderWidth: 1, borderColor: '#4285F4', textAlign: 'center' },
  saveNameBtn: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 8, marginLeft: 10, justifyContent: 'center', alignItems: 'center' },
  saveNameText: { fontSize: 18 },

  email: { fontSize: 16, color: '#aaaaaa', marginBottom: 40 },
  
  backButton: { backgroundColor: '#333333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center', marginBottom: 15 },
  backButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  logoutButton: { backgroundColor: '#ff4444', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center' },
  logoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});