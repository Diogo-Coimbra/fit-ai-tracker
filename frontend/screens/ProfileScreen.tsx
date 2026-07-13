import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Platform, TextInput, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/useAuthStore';
import { useFocusEffect } from '@react-navigation/native';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, setUser } = useAuthStore();
  
  const [profilePic, setProfilePic] = useState(user?.picture);
  const [imageError, setImageError] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(user?.name || '');
  const [displayName, setDisplayName] = useState(user?.name || '');
  
  const [tempGoal, setTempGoal] = useState(user?.weeklyGoal || 3);
  const [isSaving, setIsSaving] = useState(false);

  // ==========================================
  // US 40: ESTADOS DO PESO CORPORAL
  // ==========================================
  const [weightInput, setWeightInput] = useState('');
  const [weightHistory, setWeightHistory] = useState<any[]>([]);
  const [isSavingWeight, setIsSavingWeight] = useState(false);

  // Vai buscar o histórico de peso sempre que o ecrã foca
  useFocusEffect(
    useCallback(() => {
      const fetchWeights = async () => {
        if (!user?.id) return;
        try {
          const response = await fetch(`http://192.168.1.80:3000/api/metrics/weight/${user.id}`);
          if (response.ok) {
            const data = await response.json();
            setWeightHistory(data);
          }
        } catch (error) {
          console.error('❌ Erro ao ir buscar pesos:', error);
        }
      };
      fetchWeights();
    }, [user?.id])
  );

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

  const adjustGoal = (amount: number) => {
    setTempGoal((prev) => {
      const newGoal = prev + amount;
      if (newGoal < 1) return 1;
      if (newGoal > 7) return 7;
      return newGoal;
    });
  };

  const handleSaveGoal = async () => {
    const success = await saveProfileToDB({ weeklyGoal: tempGoal });
    if (success) {
      if (Platform.OS === 'web') alert('Objetivo semanal guardado com sucesso! 🎯');
      else Alert.alert('Sucesso', 'Objetivo semanal guardado com sucesso! 🎯');
    }
  };

  // ==========================================
  // US 40: FUNÇÃO PARA REGISTAR PESO
  // ==========================================
  const handleSaveWeight = async () => {
    if (!user?.id || !weightInput.trim()) return;

    // Converte vírgulas em pontos para garantir que o float é lido corretamente
    const formattedWeight = weightInput.replace(',', '.');
    
    if (isNaN(Number(formattedWeight))) {
      if (Platform.OS === 'web') alert('Por favor, insere um número válido.');
      else Alert.alert('Atenção', 'Por favor, insere um número válido.');
      return;
    }

    try {
      setIsSavingWeight(true);
      const response = await fetch('http://192.168.1.80:3000/api/metrics/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, weight: formattedWeight }),
      });

      if (response.ok) {
        const newWeight = await response.json();
        // Atualiza a lista na hora, colocando o novo peso em primeiro
        setWeightHistory((prev) => [newWeight, ...prev]);
        setWeightInput('');
      } else {
        throw new Error('Falha ao registar o peso.');
      }
    } catch (error) {
      console.error('❌ Erro ao guardar peso:', error);
      if (Platform.OS === 'web') alert('Erro ao registar peso.');
      else Alert.alert('Erro', 'Não foi possível registar o teu peso.');
    } finally {
      setIsSavingWeight(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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

        {tempGoal !== (user?.weeklyGoal || 3) && (
          <TouchableOpacity style={styles.saveGoalBtn} onPress={handleSaveGoal} disabled={isSaving}>
            <Text style={styles.saveGoalBtnText}>{isSaving ? 'A guardar...' : 'Guardar Objetivo'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ==========================================
          US 40: REGISTO DE PESO
          ========================================== */}
      <View style={styles.weightContainer}>
        <Text style={styles.goalTitle}>Registo de Peso ⚖️</Text>
        <Text style={styles.goalSubtitle}>Acompanha a tua evolução corporal</Text>

        <View style={styles.weightInputRow}>
          <TextInput 
            style={styles.weightInput}
            placeholder="Ex: 75.5"
            placeholderTextColor="#666"
            keyboardType="numeric"
            value={weightInput}
            onChangeText={setWeightInput}
            editable={!isSavingWeight}
          />
          <Text style={styles.weightUnit}>kg</Text>
          <TouchableOpacity style={styles.addWeightBtn} onPress={handleSaveWeight} disabled={isSavingWeight}>
            <Text style={styles.addWeightBtnText}>{isSavingWeight ? '⏳' : 'Registar'}</Text>
          </TouchableOpacity>
        </View>

        {weightHistory.length > 0 && (
          <View style={styles.historyList}>
            {weightHistory.map((item, index) => (
              <View key={item.id} style={[styles.historyRow, index === 0 && styles.historyRowLatest]}>
                <Text style={[styles.historyDate, index === 0 && styles.highlightText]}>
                  {formatDate(item.createdAt)}
                </Text>
                <Text style={[styles.historyWeight, index === 0 && styles.highlightText]}>
                  {item.weight} kg
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {/* ========================================== */}

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>⬅ Voltar ao Painel</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
        <Text style={styles.logoutText}>Sair da Conta (Logout)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  contentContainer: { alignItems: 'center', padding: 20, paddingTop: 60, paddingBottom: 40 },
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

  goalContainer: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
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

  // 👇 US 40: ESTILOS DO REGISTO DE PESO
  weightContainer: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 30, borderWidth: 1, borderColor: '#333' },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, width: '100%' },
  weightInput: { flex: 1, backgroundColor: '#2a2a2a', color: '#ffffff', padding: 12, borderRadius: 8, fontSize: 18, borderWidth: 1, borderColor: '#444', textAlign: 'center' },
  weightUnit: { color: '#aaaaaa', fontSize: 18, marginLeft: 10, marginRight: 15, fontWeight: 'bold' },
  addWeightBtn: { backgroundColor: '#4285F4', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  addWeightBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  
  historyList: { width: '100%', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  historyRowLatest: { backgroundColor: '#2a2a2a', paddingHorizontal: 10, borderRadius: 8, borderBottomWidth: 0 },
  historyDate: { color: '#aaaaaa', fontSize: 16 },
  historyWeight: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  highlightText: { color: '#4CAF50' }, // Destaca o peso mais recente a verde
  
  backButton: { backgroundColor: '#333333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center', marginBottom: 15 },
  backButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  logoutButton: { backgroundColor: '#ff4444', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, elevation: 3, width: '100%', alignItems: 'center' },
  logoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});