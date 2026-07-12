import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Platform, TextInput, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/useAuthStore';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, setUser } = useAuthStore();
  
  const [profilePic, setProfilePic] = useState(user?.picture);
  const [imageError, setImageError] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(user?.name || '');
  const [displayName, setDisplayName] = useState(user?.name || '');
  
  // ==========================================
  // US 33: ESTADOS DO OBJETIVO SEMANAL
  // ==========================================
  const [tempGoal, setTempGoal] = useState(user?.weeklyGoal || 3);
  const [isSaving, setIsSaving] = useState(false);

  // Função principal para enviar dados para o backend
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
        setUser(updatedUser); // AC 3: Atualiza o Zustand instantaneamente
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
      base64: true,
    });

    if (!result.canceled) {
      const newPicUri = result.assets[0].uri;
      setProfilePic(newPicUri);
      setImageError(false);
      await saveProfileToDB({ picture: newPicUri });
    }
  };

  const handleSaveName = async () => {
    if (!tempName.trim()) {
      if (Platform.OS === 'web') alert('O nome não pode estar vazio!');
      else Alert.alert('Atenção', 'O nome não pode estar vazio!');
      return;
    }
    
    const success = await saveProfileToDB({ name: tempName });
    if (success) {
      setDisplayName(tempName); 
      setIsEditingName(false); 
    }
  };

  // Funções para alterar o objetivo (+ e -)
  const adjustGoal = (amount: number) => {
    setTempGoal((prev) => {
      const newGoal = prev + amount;
      if (newGoal < 1) return 1;
      if (newGoal > 7) return 7;
      return newGoal;
    });
  };

  // Função para guardar o objetivo
  const handleSaveGoal = async () => {
    const success = await saveProfileToDB({ weeklyGoal: tempGoal });
    if (success) {
      if (Platform.OS === 'web') alert('Objetivo semanal guardado com sucesso! 🎯');
      else Alert.alert('Sucesso', 'Objetivo semanal guardado com sucesso! 🎯');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>O Meu Perfil 👤</Text>

      <TouchableOpacity onPress={pickImage} style={styles.imageContainer} activeOpacity={0.8} disabled={isSaving}>
        {profilePic && !imageError ? (
          <Image source={{ uri: profilePic }} style={styles.profileImage} onError={() => setImageError(true)} />
        ) : (
          <View style={styles.placeholderImage}><Text style={styles.placeholderText}>👤</Text></View>
        )}
        <View style={styles.editBadge}><Text style={styles.editBadgeText}>✏️</Text></View>
      </TouchableOpacity>
      
      {isEditingName ? (
        <View style={styles.editNameContainer}>
          <TextInput 
            style={styles.nameInput} value={tempName} onChangeText={setTempName}
            autoFocus placeholder="O teu novo nome..." placeholderTextColor="#666" editable={!isSaving}
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

      {/* ==========================================
          US 33: SELETOR DE OBJETIVO SEMANAL
          ========================================== */}
      <View style={styles.goalContainer}>
        <Text style={styles.goalTitle}>Objetivo Semanal 🎯</Text>
        <Text style={styles.goalSubtitle}>Quantos dias queres treinar por semana?</Text>
        
        <View style={styles.goalControls}>
          <TouchableOpacity style={styles.goalBtn} onPress={() => adjustGoal(-1)} disabled={tempGoal <= 1 || isSaving}>
            <Text style={styles.goalBtnText}>-</Text>
          </TouchableOpacity>
          
          <View style={styles.goalDisplay}>
            <Text style={styles.goalNumber}>{tempGoal}</Text>
            <Text style={styles.goalLabel}>treinos</Text>
          </View>

          <TouchableOpacity style={styles.goalBtn} onPress={() => adjustGoal(1)} disabled={tempGoal >= 7 || isSaving}>
            <Text style={styles.goalBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Mostramos o botão de guardar apenas se o número escolhido for diferente do que está na Base de Dados */}
        {tempGoal !== (user?.weeklyGoal || 3) && (
          <TouchableOpacity style={styles.saveGoalBtn} onPress={handleSaveGoal} disabled={isSaving}>
            <Text style={styles.saveGoalBtnText}>{isSaving ? 'A guardar...' : 'Guardar Objetivo'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* ========================================== */}

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
        <Text style={styles.logoutText}>Sair da Conta (Logout)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', alignItems: 'center', padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 30 },
  
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

  email: { fontSize: 16, color: '#aaaaaa', marginBottom: 30 },

  // US 33: Estilos do Objetivo
  goalContainer: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 30, borderWidth: 1, borderColor: '#333' },
  goalTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  goalSubtitle: { fontSize: 14, color: '#aaaaaa', marginBottom: 15 },
  goalControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '60%', marginBottom: 10 },
  goalBtn: { backgroundColor: '#333', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  goalBtnText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', marginTop: -2 },
  goalDisplay: { alignItems: 'center' },
  goalNumber: { fontSize: 32, fontWeight: 'bold', color: '#4CAF50' },
  goalLabel: { fontSize: 12, color: '#aaaaaa', textTransform: 'uppercase' },
  saveGoalBtn: { backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, marginTop: 10 },
  saveGoalBtnText: { color: '#ffffff', fontWeight: 'bold' },
  
  backButton: { backgroundColor: '#333333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center', marginBottom: 15 },
  backButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  logoutButton: { backgroundColor: '#ff4444', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center' },
  logoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});