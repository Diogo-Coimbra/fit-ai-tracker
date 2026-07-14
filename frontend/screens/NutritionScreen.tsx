import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, Modal, Image, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/useAuthStore';

export default function NutritionScreen({ navigation }: any) {
  const { user } = useAuthStore();
  
  const [todayMeals, setTodayMeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Estados para a IA e Modal
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [tempImageUri, setTempImageUri] = useState<string | null>(null);

  // Objetivos Diários (com valores por defeito caso o user não tenha definido)
  const goalCalories = user?.dailyCalories || 2500;
  const goalProtein = user?.dailyProtein || 150;
  const goalCarbs = user?.dailyCarbs || 300;
  const goalFat = user?.dailyFat || 80;

  const fetchTodayMeals = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      const response = await fetch(`http://192.168.1.80:3000/api/nutrition/meals/${user.id}/today`);
      const data = await response.json();
      setTodayMeals(data);
    } catch (error) {
      console.error('❌ Erro ao ir buscar as refeições de hoje:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTodayMeals();
    }, [user?.id])
  );

  // Cálculos do resumo diário
  const consumedCalories = todayMeals.reduce((acc, meal) => acc + (meal.calories || 0), 0);
  const consumedProtein = todayMeals.reduce((acc, meal) => acc + (meal.protein || 0), 0);
  const consumedCarbs = todayMeals.reduce((acc, meal) => acc + (meal.carbs || 0), 0);
  const consumedFat = todayMeals.reduce((acc, meal) => acc + (meal.fat || 0), 0);

  // ==========================================
  // US 44: AC 2 & 3 - Tira foto, analisa e guarda
  // ==========================================
  const handlePickImage = async (useCamera: boolean = false) => {
    let result;
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true, // Crucial para enviar para a IA
    };

    if (useCamera) {
      await ImagePicker.requestCameraPermissionsAsync();
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!result.canceled && result.assets[0].base64) {
      setTempImageUri(result.assets[0].uri);
      analyzeImageWithAI(result.assets[0].base64);
    }
  };

  const analyzeImageWithAI = async (base64Image: string) => {
    try {
      setIsAnalyzing(true);
      const response = await fetch('http://192.168.1.80:3000/api/nutrition/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Image }),
      });

      if (!response.ok) throw new Error('Falha na IA');

      const data = await response.json();
      setAiResult(data);
      setModalVisible(true);
    } catch (error) {
      console.error('❌ Erro na IA:', error);
      if (Platform.OS === 'web') alert('Erro ao analisar a imagem. Tenta novamente.');
      else Alert.alert('Erro', 'O nosso nutricionista IA não conseguiu ver bem a foto. Tenta outra vez!');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const confirmAndSaveMeal = async () => {
    if (!user?.id || !aiResult) return;

    try {
      const response = await fetch('http://192.168.1.80:3000/api/nutrition/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name: aiResult.name,
          calories: aiResult.calories,
          protein: aiResult.protein,
          carbs: aiResult.carbs,
          fat: aiResult.fat,
          imageUri: tempImageUri,
        }),
      });

      if (response.ok) {
        setModalVisible(false);
        setAiResult(null);
        setTempImageUri(null);
        fetchTodayMeals(); // Atualiza a lista e o dashboard na hora!
      } else {
        throw new Error('Falha ao guardar.');
      }
    } catch (error) {
      console.error('❌ Erro ao guardar refeição:', error);
      if (Platform.OS === 'web') alert('Erro ao guardar a refeição.');
      else Alert.alert('Erro', 'Não foi possível guardar a refeição no teu diário.');
    }
  };

  const renderMeal = ({ item }: any) => (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealName}>{item.name}</Text>
        <Text style={styles.mealCalories}>{item.calories} kcal</Text>
      </View>
      <View style={styles.mealMacrosRow}>
        <Text style={styles.macroText}>🥩 P: {item.protein}g</Text>
        <Text style={styles.macroText}>🍚 H: {item.carbs}g</Text>
        <Text style={styles.macroText}>🥑 G: {item.fat}g</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHeader}>
        <Text style={styles.backHeaderText}>⬅ Voltar</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Nutrição 🍎</Text>
      <Text style={styles.subtitle}>Diário de Calorias Inteligente</Text>

      {/* ==========================================
          US 44: AC 1 - Painel Resumo (Dashboard)
          ========================================== */}
      <View style={styles.dashboardCard}>
        <Text style={styles.dashboardTitle}>Resumo de Hoje</Text>
        
        <View style={styles.caloriesRow}>
          <View style={styles.calInfo}>
            <Text style={styles.calValue}>{consumedCalories}</Text>
            <Text style={styles.calLabel}>Consumidas</Text>
          </View>
          <Text style={styles.calDivider}>/</Text>
          <View style={styles.calInfo}>
            <Text style={styles.calGoalValue}>{goalCalories}</Text>
            <Text style={styles.calLabel}>Objetivo</Text>
          </View>
        </View>

        <View style={styles.macrosContainer}>
          <View style={styles.macroBadge}>
            <Text style={styles.macroBadgeTitle}>Proteína</Text>
            <Text style={styles.macroBadgeValue}>{consumedProtein} / {goalProtein}g</Text>
          </View>
          <View style={styles.macroBadge}>
            <Text style={styles.macroBadgeTitle}>Hidratos</Text>
            <Text style={styles.macroBadgeValue}>{consumedCarbs} / {goalCarbs}g</Text>
          </View>
          <View style={styles.macroBadge}>
            <Text style={styles.macroBadgeTitle}>Gordura</Text>
            <Text style={styles.macroBadgeValue}>{consumedFat} / {goalFat}g</Text>
          </View>
        </View>
      </View>

      {/* ==========================================
          US 44: AC 2 - Botões de Câmera e Galeria
          ========================================== */}
      {isAnalyzing ? (
        <View style={styles.analyzingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.analyzingText}>A IA está a analisar o teu prato... 🧠</Text>
        </View>
      ) : (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.cameraBtn} onPress={() => handlePickImage(true)}>
            <Text style={styles.btnText}>📸 Tirar Foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryBtn} onPress={() => handlePickImage(false)}>
            <Text style={styles.btnText}>🖼️ Galeria</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Refeições de Hoje</Text>
      
      {isLoading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={todayMeals}
          keyExtractor={(item) => item.id}
          renderItem={renderMeal}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Ainda não registaste nenhuma refeição hoje. Tira uma foto ao teu prato! 📸</Text>
          }
        />
      )}

      {/* ==========================================
          US 44: AC 3 - Modal de Confirmação da IA
          ========================================== */}
      <Modal animationType="slide" transparent={true} visible={modalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Análise Concluída! ✨</Text>
            
            {tempImageUri && (
              <Image source={{ uri: tempImageUri }} style={styles.previewImage} />
            )}

            <View style={styles.aiResultBox}>
              <Text style={styles.aiMealName}>{aiResult?.name}</Text>
              <Text style={styles.aiCalories}>{aiResult?.calories} kcal</Text>
              <View style={styles.aiMacrosRow}>
                <Text style={styles.aiMacroText}>Proteína: {aiResult?.protein}g</Text>
                <Text style={styles.aiMacroText}>Hidratos: {aiResult?.carbs}g</Text>
                <Text style={styles.aiMacroText}>Gordura: {aiResult?.fat}g</Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmAndSaveMeal}>
                <Text style={styles.confirmBtnText}>✅ Guardar Refeição</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 50 },
  backHeader: { marginBottom: 15 },
  backHeaderText: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 20 },

  dashboardCard: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, marginBottom: 25, borderWidth: 1, borderColor: '#333' },
  dashboardTitle: { fontSize: 18, color: '#fff', fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  caloriesRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 20 },
  calInfo: { alignItems: 'center', marginHorizontal: 15 },
  calValue: { fontSize: 36, fontWeight: 'bold', color: '#FFD700' },
  calGoalValue: { fontSize: 24, fontWeight: 'bold', color: '#888', marginBottom: 4 },
  calLabel: { fontSize: 12, color: '#aaa', textTransform: 'uppercase' },
  calDivider: { fontSize: 30, color: '#444', marginBottom: 10 },
  
  macrosContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  macroBadge: { alignItems: 'center', backgroundColor: '#2a2a2a', padding: 10, borderRadius: 8, flex: 1, marginHorizontal: 4 },
  macroBadgeTitle: { fontSize: 12, color: '#888', marginBottom: 4 },
  macroBadgeValue: { fontSize: 14, color: '#fff', fontWeight: 'bold' },

  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  cameraBtn: { flex: 1, backgroundColor: '#FFD700', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginRight: 5, elevation: 3 },
  galleryBtn: { flex: 1, backgroundColor: '#4285F4', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginLeft: 5, elevation: 3 },
  btnText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
  
  analyzingContainer: { alignItems: 'center', marginBottom: 25, padding: 15, backgroundColor: '#1e1e1e', borderRadius: 8, borderWidth: 1, borderColor: '#FFD700' },
  analyzingText: { color: '#FFD700', marginTop: 10, fontWeight: 'bold' },

  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 5 },
  listContent: { paddingBottom: 20 },
  emptyText: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginTop: 30, fontStyle: 'italic' },
  
  mealCard: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#FFD700' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mealName: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', flex: 1 },
  mealCalories: { fontSize: 18, fontWeight: 'bold', color: '#FFD700' },
  mealMacrosRow: { flexDirection: 'row', justifyContent: 'flex-start', gap: 15 },
  macroText: { fontSize: 13, color: '#aaaaaa' },

  // Estilos do Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e1e1e', width: '100%', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  previewImage: { width: 150, height: 150, borderRadius: 12, marginBottom: 15, borderWidth: 2, borderColor: '#333' },
  
  aiResultBox: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 20 },
  aiMealName: { fontSize: 20, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 5 },
  aiCalories: { fontSize: 28, fontWeight: 'bold', color: '#FFD700', marginBottom: 10 },
  aiMacrosRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  aiMacroText: { color: '#aaa', fontSize: 14 },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  cancelBtn: { flex: 1, backgroundColor: '#333', padding: 15, borderRadius: 8, alignItems: 'center', marginRight: 5 },
  cancelBtnText: { color: '#fff', fontWeight: 'bold' },
  confirmBtn: { flex: 1, backgroundColor: '#4CAF50', padding: 15, borderRadius: 8, alignItems: 'center', marginLeft: 5 },
  confirmBtnText: { color: '#fff', fontWeight: 'bold' },
});