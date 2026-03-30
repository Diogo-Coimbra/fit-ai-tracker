import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Platform, TextInput, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/useAuthStore';

export default function ProfileScreen({ navigation }: any) {
  // AC 2: Agora fomos buscar também o 'setUser' ao nosso estado global
  const { user, logout, setUser } = useAuthStore();
  
  const [profilePic, setProfilePic] = useState(user?.picture);
  const [imageError, setImageError] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(user?.name || '');
  const [displayName, setDisplayName] = useState(user?.name || '');
  
  // Estado para dar feedback visual enquanto guarda
  const [isSaving, setIsSaving] = useState(false);

  // Função para guardar DADOS NA BD
  const saveProfileToDB = async (updateData: any) => {
    if (!user || !user.id) return false;

    try {
      setIsSaving(true);
      const response = await fetch(`http://192.168.1.80:3000/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const updatedUser = await response.json();
        // AC 2: Atualizamos o estado global instantaneamente!
        setUser(updatedUser);
        return true;
      } else {
        throw new Error('Falha ao atualizar na base de dados.');
      }
    } catch (error) {
      console.error('❌ Erro ao guardar perfil:', error);
      if (Platform.OS === 'web') alert('Erro ao guardar as alterações.');
      else Alert.alert('Erro', 'Não foi possível guardar as alterações.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true, // Importante para enviar a imagem para a BD se necessário (simplificado aqui com URI)
    });

    if (!result.canceled) {
      const newPicUri = result.assets[0].uri;
      
      // Atualiza visualmente primeiro para ser instantâneo
      setProfilePic(newPicUri);
      setImageError(false);
      
      // AC 1: Envia a nova foto para a Base de Dados
      await saveProfileToDB({ picture: newPicUri });
    }
  };

  const handleSaveName = async () => {
    if (!tempName.trim()) {
      if (Platform.OS === 'web') alert('O nome não pode estar vazio!');
      else Alert.alert('Atenção', 'O nome não pode estar vazio!');
      return;
    }
    
    // AC 1: Envia o novo nome para a Base de Dados
    const success = await saveProfileToDB({ name: tempName });
    
    if (success) {
      setDisplayName(tempName); 
      setIsEditingName(false); 
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>O Meu Perfil 👤</Text>

      <TouchableOpacity onPress={pickImage} style={styles.imageContainer} activeOpacity={0.8} disabled={isSaving}>
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
      
      {isEditingName ? (
        <View style={styles.editNameContainer}>
          <TextInput 
            style={styles.nameInput}
            value={tempName}
            onChangeText={setTempName}
            autoFocus
            placeholder="O teu novo nome..."
            placeholderTextColor="#666"
            editable={!isSaving}
          />
          <TouchableOpacity style={styles.saveNameBtn} onPress={handleSaveName} disabled={isSaving}>
            <Text style={styles.saveNameText}>{isSaving ? '⏳' : '✅'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.nameDisplayContainer} onPress={() => setIsEditingName(true)} disabled={isSaving}>
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