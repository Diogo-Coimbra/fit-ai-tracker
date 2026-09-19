import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, ProgressBar } from '../components/ui';
import { ColorScheme, radius, space } from '../theme';
import { api } from '../services/api';
import { LineChart, ChartDataPoint } from '../components/LineChart';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../store/useThemeStore';
import { useLanguage } from '../store/useLanguageStore';
import PhotoCompareModal from '../components/PhotoCompareModal';
import { generateAndShareCoachReportPDF } from '../utils/pdfReport';

export default function ClientDetailsScreen({ route, navigation }: any) {
  const { clientId } = route.params;
  const { user } = useAuthStore();
  const { colors, mode } = useTheme();
  const { t, language } = useLanguage();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const localeMap: Record<string, string> = { pt: 'pt-PT', en: 'en-US', es: 'es-ES', fr: 'fr-FR' };
  const currentLocale = localeMap[language] || 'pt-PT';

  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workouts' | 'history' | 'nutrition' | 'weight' | 'checkins' | 'charts'>('workouts');

  // Relatório PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Modal de Comparador de Fotos Antes & Depois
  const [isPhotoCompareVisible, setIsPhotoCompareVisible] = useState(false);

  // Check-ins Semanais do Aluno
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [isSendingFeedback, setIsSendingFeedback] = useState<Record<string, boolean>>({});

  // Gráficos de Evolução (Peso e 1RM)
  const [analytics, setAnalytics] = useState<{ weightHistory: any[]; strengthHistory: any[] } | null>(null);
  const [selectedExerciseName, setSelectedExerciseName] = useState<string>('');

  // Modal: Atribuir a partir de Modelo
  const [isTemplateModalVisible, setIsTemplateModalVisible] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isAssigningTemplate, setIsAssigningTemplate] = useState(false);

  // Modal: Ajustar Metas do Aluno
  const [isGoalsModalVisible, setIsGoalsModalVisible] = useState(false);
  const [isSavingGoals, setIsSavingGoals] = useState(false);
  const [goalCalories, setGoalCalories] = useState('');
  const [goalProtein, setGoalProtein] = useState('');
  const [goalCarbs, setGoalCarbs] = useState('');
  const [goalFat, setGoalFat] = useState('');
  const [goalWeekly, setGoalWeekly] = useState('3');

  // Modal: Nova Avaliação Corporal
  const [isAssessmentModalVisible, setIsAssessmentModalVisible] = useState(false);
  const [isSavingAssessment, setIsSavingAssessment] = useState(false);
  const [assessmentWeight, setAssessmentWeight] = useState('');
  const [assessmentBodyFat, setAssessmentBodyFat] = useState('');
  const [assessmentChest, setAssessmentChest] = useState('');
  const [assessmentWaist, setAssessmentWaist] = useState('');
  const [assessmentArms, setAssessmentArms] = useState('');
  const [assessmentThighs, setAssessmentThighs] = useState('');
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [assessmentPhotoUri, setAssessmentPhotoUri] = useState<string | null>(null);
  const [assessmentPhotoBase64, setAssessmentPhotoBase64] = useState<string | null>(null);

  // Filtro de Nutrição do Aluno (Hoje, Ontem, Histórico Completo)
  const [nutritionFilter, setNutritionFilter] = useState<'today' | 'yesterday' | 'all'>('today');

  const isSameLocalDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const clientMeals: any[] = useMemo(() => client?.meals || [], [client?.meals]);

  const todayDate = useMemo(() => new Date(), []);
  const yesterdayDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }, []);

  const todayMeals = useMemo(() => {
    return clientMeals.filter((m) => isSameLocalDay(new Date(m.createdAt), todayDate));
  }, [clientMeals, todayDate]);

  const yesterdayMeals = useMemo(() => {
    return clientMeals.filter((m) => isSameLocalDay(new Date(m.createdAt), yesterdayDate));
  }, [clientMeals, yesterdayDate]);

  const activeDayMeals = nutritionFilter === 'yesterday' ? yesterdayMeals : todayMeals;
  const activeDayCalories = useMemo(() => activeDayMeals.reduce((acc, m) => acc + (m.calories || 0), 0), [activeDayMeals]);
  const activeDayProtein = useMemo(() => activeDayMeals.reduce((acc, m) => acc + (m.protein || 0), 0), [activeDayMeals]);
  const activeDayCarbs = useMemo(() => activeDayMeals.reduce((acc, m) => acc + (m.carbs || 0), 0), [activeDayMeals]);
  const activeDayFat = useMemo(() => activeDayMeals.reduce((acc, m) => acc + (m.fat || 0), 0), [activeDayMeals]);

  // Agrupamento por dia para o modo Histórico Completo
  const groupedMeals = useMemo(() => {
    const groups: {
      dateKey: string;
      displayDate: string;
      totalCalories: number;
      totalProtein: number;
      totalCarbs: number;
      totalFat: number;
      meals: any[];
    }[] = [];

    clientMeals.forEach((meal) => {
      const mDate = new Date(meal.createdAt);
      const dateKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}-${String(mDate.getDate()).padStart(2, '0')}`;
      let group = groups.find((g) => g.dateKey === dateKey);
      if (!group) {
        let displayDate = mDate.toLocaleDateString(currentLocale, {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        if (isSameLocalDay(mDate, todayDate)) {
          displayDate = `Hoje (${mDate.toLocaleDateString(currentLocale, { day: '2-digit', month: 'short' })})`;
        } else if (isSameLocalDay(mDate, yesterdayDate)) {
          displayDate = `Ontem (${mDate.toLocaleDateString(currentLocale, { day: '2-digit', month: 'short' })})`;
        }
        group = {
          dateKey,
          displayDate,
          totalCalories: 0,
          totalProtein: 0,
          totalCarbs: 0,
          totalFat: 0,
          meals: [],
        };
        groups.push(group);
      }
      group.meals.push(meal);
      group.totalCalories += meal.calories || 0;
      group.totalProtein += meal.protein || 0;
      group.totalCarbs += meal.carbs || 0;
      group.totalFat += meal.fat || 0;
    });
    return groups;
  }, [clientMeals, currentLocale, todayDate, yesterdayDate]);

  const fetchClientDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const [data, checkInsData, analyticsData] = await Promise.all([
        api.get(`/api/coach/clients/${clientId}`),
        api.get(`/api/checkins/client/${clientId}`).catch(() => []),
        api.get(`/api/analytics/progress/${clientId}`).catch(() => null),
      ]);
      setClient(data);
      setCheckIns(checkInsData || []);
      setAnalytics(analyticsData);
      if (analyticsData?.strengthHistory?.length > 0) {
        setSelectedExerciseName(analyticsData.strengthHistory[0].exerciseName);
      }
    } catch (error: any) {
      console.error('Erro ao carregar detalhes do aluno:', error);
      Alert.alert(t('common.error'), error.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  }, [clientId, t]);

  const handleSendFeedback = async (checkInId: string) => {
    const feedback = feedbackDrafts[checkInId]?.trim();
    if (!feedback) {
      Alert.alert(t('common.attention'), t('clientDetails.feedbackEmptyAlert'));
      return;
    }

    try {
      setIsSendingFeedback((prev) => ({ ...prev, [checkInId]: true }));
      const updated = await api.patch(`/api/checkins/${checkInId}/feedback`, { coachFeedback: feedback });
      setCheckIns((prev) =>
        prev.map((c) =>
          c.id === checkInId
            ? { ...c, coachFeedback: updated.coachFeedback, reviewedAt: updated.reviewedAt }
            : c
        )
      );
      Alert.alert(t('common.success'), t('clientDetails.feedbackSentSuccess'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('clientDetails.feedbackSentError'));
    } finally {
      setIsSendingFeedback((prev) => ({ ...prev, [checkInId]: false }));
    }
  };

  const handleSendPushReminder = async () => {
    Alert.alert(
      t('clientDetails.sendReminderAlertTitle'),
      t('clientDetails.sendReminderAlertMsg', { name: client?.name || t('clientDetails.studentFile') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('clientDetails.sendReminderBtn'),
          onPress: async () => {
            try {
              await api.post('/api/coach/notify-inactive', { clientId });
              Alert.alert(t('common.success'), t('clientDetails.reminderSentSuccess', { name: client?.name || '' }));
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('clientDetails.reminderSentError'));
            }
          },
        },
      ]
    );
  };

  const handleExportPDF = async () => {
    try {
      setIsExportingPDF(true);

      const sortedCheckIns = [...checkIns].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const earliestCheckIn = sortedCheckIns.find(
        (c) => c.frontPhotoUrl || c.backPhotoUrl || c.sidePhotoUrl
      );
      const latestCheckIn = [...sortedCheckIns].reverse().find(
        (c) => c.frontPhotoUrl || c.backPhotoUrl || c.sidePhotoUrl
      );

      const beforePhotoUrl =
        earliestCheckIn?.frontPhotoUrl ||
        earliestCheckIn?.sidePhotoUrl ||
        earliestCheckIn?.backPhotoUrl ||
        null;
      const afterPhotoUrl =
        latestCheckIn && latestCheckIn.id !== earliestCheckIn?.id
          ? latestCheckIn?.frontPhotoUrl ||
            latestCheckIn?.sidePhotoUrl ||
            latestCheckIn?.backPhotoUrl ||
            null
          : null;

      const beforeDate = earliestCheckIn
        ? new Date(earliestCheckIn.createdAt).toLocaleDateString(currentLocale)
        : undefined;
      const afterDate =
        latestCheckIn && latestCheckIn.id !== earliestCheckIn?.id
          ? new Date(latestCheckIn.createdAt).toLocaleDateString(currentLocale)
          : undefined;

      const currentWeight = client?.bodyMetrics?.[0]?.weight || checkIns[0]?.weight || '--';
      const initialWeight =
        sortedCheckIns[0]?.weight ||
        client?.bodyMetrics?.[client?.bodyMetrics?.length - 1]?.weight ||
        currentWeight;
      let weightDelta: string | number | undefined = undefined;
      if (typeof currentWeight === 'number' && typeof initialWeight === 'number') {
        weightDelta = Number((currentWeight - initialWeight).toFixed(1));
      }

      await generateAndShareCoachReportPDF({
        coachName: user?.name || 'Treinador',
        coachBrandName: (user as any)?.coachBrandName || null,
        coachLogoUrl: (user as any)?.coachLogoUrl || null,
        coachPhone: (user as any)?.coachPhone || null,
        clientName: client?.name || 'Aluno',
        clientEmail: client?.email || '',
        currentWeight,
        initialWeight,
        weightDelta,
        totalWorkouts: client?.workouts?.length || 0,
        currentStreak: client?.currentStreak || 0,
        bodyFat: client?.bodyMetrics?.[0]?.bodyFat,
        beforePhotoUrl,
        afterPhotoUrl,
        beforeDate,
        afterDate,
        coachNotes:
          client?.coachNotes ||
          t('clientDetails.defaultCoachNotes'),
      });
    } catch (err: any) {
      console.error('Erro ao gerar relatório PDF:', err);
      Alert.alert(t('common.error'), t('clientDetails.pdfExportError'));
    } finally {
      setIsExportingPDF(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchClientDetails();
    }, [fetchClientDetails])
  );

  const handleRemoveClient = () => {
    Alert.alert(
      t('clientDetails.removeStudent'),
      t('clientDetails.confirmRemoveStudent', { name: client?.name || '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/coach/clients/${clientId}`);
              Alert.alert(t('common.success'), t('clientDetails.studentRemovedSuccess'));
              navigation.goBack();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('common.error'));
            }
          },
        },
      ]
    );
  };

  // Carregar e abrir modal de templates
  const handleOpenTemplatesModal = async () => {
    try {
      setIsLoadingTemplates(true);
      setIsTemplateModalVisible(true);
      const data = await api.get('/api/coach/templates');
      setTemplates(data || []);
    } catch (error: any) {
      Alert.alert(t('common.error'), t('common.error'));
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Atribuir modelo selecionado ao aluno
  const handleAssignTemplate = (template: any) => {
    Alert.alert(
      t('clientDetails.assignTemplateTitle'),
      t('clientDetails.assignTemplateConfirm', { template: template.name, name: client?.name || '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              setIsAssigningTemplate(true);
              await api.post('/api/coach/assign-workout', {
                clientId,
                workoutId: template.id,
              });
              setIsTemplateModalVisible(false);
              Alert.alert(t('common.success'), t('clientDetails.assignTemplateSuccess', { template: template.name }));
              fetchClientDetails();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('common.error'));
            } finally {
              setIsAssigningTemplate(false);
            }
          },
        },
      ]
    );
  };

  const handleAssignWorkoutOptions = () => {
    Alert.alert(
      t('clientDetails.assignWorkout'),
      t('clientDetails.selectAssignMethod'),
      [
        {
          text: t('clientDetails.fromTemplate'),
          onPress: () => handleOpenTemplatesModal(),
        },
        {
          text: t('clientDetails.withAI'),
          onPress: () => navigation.navigate('AIGenerator', { targetClientId: clientId }),
        },
        {
          text: t('clientDetails.createManually'),
          onPress: () => navigation.navigate('CreateWorkout', { targetClientId: clientId }),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  // Metas do Aluno
  const handleOpenGoalsModal = () => {
    setGoalCalories(client?.dailyCalories ? String(client.dailyCalories) : '');
    setGoalProtein(client?.dailyProtein ? String(client.dailyProtein) : '');
    setGoalCarbs(client?.dailyCarbs ? String(client.dailyCarbs) : '');
    setGoalFat(client?.dailyFat ? String(client.dailyFat) : '');
    setGoalWeekly(client?.weeklyGoal ? String(client.weeklyGoal) : '3');
    setIsGoalsModalVisible(true);
  };

  const handleSaveGoals = async () => {
    try {
      setIsSavingGoals(true);
      const updated = await api.put(`/api/coach/clients/${clientId}/goals`, {
        dailyCalories: goalCalories ? Number(goalCalories) : null,
        dailyProtein: goalProtein ? Number(goalProtein) : null,
        dailyCarbs: goalCarbs ? Number(goalCarbs) : null,
        dailyFat: goalFat ? Number(goalFat) : null,
        weeklyGoal: goalWeekly ? Math.max(1, Number(goalWeekly)) : 3,
      });

      setClient((prev: any) => ({
        ...prev,
        ...updated,
      }));

      setIsGoalsModalVisible(false);
      Alert.alert(t('common.success'), t('clientDetails.goalsSavedSuccess'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('common.error'));
    } finally {
      setIsSavingGoals(false);
    }
  };

  // Avaliação Corporal
  const handlePickAssessmentPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setAssessmentPhotoUri(asset.uri);
        let b64 = asset.base64 || null;
        if (b64 && !b64.startsWith('data:')) {
          b64 = `data:image/jpeg;base64,${b64}`;
        }
        setAssessmentPhotoBase64(b64);
      }
    } catch (error) {
      console.error('Erro ao escolher imagem:', error);
      Alert.alert(t('common.error'), t('common.error'));
    }
  };

  const handleOpenAssessmentModal = () => {
    setAssessmentWeight('');
    setAssessmentBodyFat('');
    setAssessmentChest('');
    setAssessmentWaist('');
    setAssessmentArms('');
    setAssessmentThighs('');
    setAssessmentNotes('');
    setAssessmentPhotoUri(null);
    setAssessmentPhotoBase64(null);
    setIsAssessmentModalVisible(true);
  };

  const handleSaveAssessment = async () => {
    if (!assessmentWeight.trim()) {
      Alert.alert(t('common.attention'), t('clientDetails.weightRequiredAlert'));
      return;
    }

    try {
      setIsSavingAssessment(true);

      let photoUrl: string | null = null;
      if (assessmentPhotoBase64) {
        try {
          const uploadRes = await api.post('/api/uploads', { imageBase64: assessmentPhotoBase64 });
          if (uploadRes?.url) {
            photoUrl = uploadRes.url;
          }
        } catch (uploadErr) {
          console.warn('Falha no upload da foto de avaliação:', uploadErr);
        }
      }

      await api.post('/api/metrics/assessment', {
        targetUserId: clientId,
        weight: Number(assessmentWeight.replace(',', '.')),
        bodyFat: assessmentBodyFat ? Number(assessmentBodyFat.replace(',', '.')) : null,
        chest: assessmentChest ? Number(assessmentChest.replace(',', '.')) : null,
        waist: assessmentWaist ? Number(assessmentWaist.replace(',', '.')) : null,
        arms: assessmentArms ? Number(assessmentArms.replace(',', '.')) : null,
        thighs: assessmentThighs ? Number(assessmentThighs.replace(',', '.')) : null,
        photoUrl,
        notes: assessmentNotes.trim() || null,
      });

      setIsAssessmentModalVisible(false);
      Alert.alert(t('common.success'), t('clientDetails.assessmentSavedSuccess'));
      fetchClientDetails();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('common.error'));
    } finally {
      setIsSavingAssessment(false);
    }
  };

  if (isLoading && !client) {
    return (
      <Screen style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Screen>
    );
  }

  const initial = (client?.name || 'A').charAt(0).toUpperCase();
  const latestWeight = client?.bodyMetrics?.[0]?.weight || '--';

  return (
    <Screen>
      <View style={styles.container}>
        {/* Barra Superior */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{t('clientDetails.studentFile')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={handleExportPDF}
              style={styles.backBtn}
              disabled={isExportingPDF}
            >
              {isExportingPDF ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="document-text-outline" size={22} color={colors.accent} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Chat', {
                  targetUserId: clientId,
                  targetUserName: client?.name || 'Aluno',
                  targetUserRole: 'Aluno',
                })
              }
              style={styles.backBtn}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendPushReminder} style={styles.backBtn}>
              <Ionicons name="notifications-outline" size={22} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRemoveClient} style={styles.backBtn}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Cartão de Perfil do Aluno */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            {client?.picture ? (
              <Image source={{ uri: client.picture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
            )}
            <View style={styles.profileText}>
              <Text style={styles.clientName}>{client?.name}</Text>
              <Text style={styles.clientEmail}>{client?.email}</Text>
            </View>
          </View>

          {/* Métricas Rápidas */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{latestWeight} kg</Text>
              <Text style={styles.metricLabel}>{t('clientDetails.currentWeight')}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{client?.currentStreak || 0} {t('clientDetails.weeksCount')}</Text>
              <Text style={styles.metricLabel}>{t('clientDetails.currentStreak')}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{client?.weeklyGoal || 3}x</Text>
              <Text style={styles.metricLabel}>{t('clientDetails.weeklyGoal')}</Text>
            </View>
          </View>
        </Card>

        {/* Separadores de Navegação */}
        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScrollContent}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'workouts' && styles.tabActive]}
              onPress={() => setActiveTab('workouts')}
            >
              <Text style={[styles.tabText, activeTab === 'workouts' && styles.tabTextActive]}>
                {t('clientDetails.tabWorkouts')} ({client?.workouts?.length || 0})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'history' && styles.tabActive]}
              onPress={() => setActiveTab('history')}
            >
              <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                {t('clientDetails.tabHistory')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'checkins' && styles.tabActive]}
              onPress={() => setActiveTab('checkins')}
            >
              <Text style={[styles.tabText, activeTab === 'checkins' && styles.tabTextActive]}>
                📋 {t('checkin.tabTitle')} ({checkIns.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'charts' && styles.tabActive]}
              onPress={() => setActiveTab('charts')}
            >
              <Text style={[styles.tabText, activeTab === 'charts' && styles.tabTextActive]}>
                📈 {t('analytics.chartsTitle')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'nutrition' && styles.tabActive]}
              onPress={() => setActiveTab('nutrition')}
            >
              <Text style={[styles.tabText, activeTab === 'nutrition' && styles.tabTextActive]}>
                {t('clientDetails.tabNutrition')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'weight' && styles.tabActive]}
              onPress={() => setActiveTab('weight')}
            >
              <Text style={[styles.tabText, activeTab === 'weight' && styles.tabTextActive]}>
                {t('clientDetails.tabAssessment')} ({client?.bodyMetrics?.length || 0})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* SEPARADOR 1: TREINOS ATRIBUÍDOS */}
        {activeTab === 'workouts' && (
          <View style={{ flex: 1 }}>
            <View style={styles.actionHeader}>
              <Text style={styles.tabSectionTitle}>{t('clientDetails.prescribedPlans')}</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={handleAssignWorkoutOptions}>
                <Ionicons name="add" size={18} color={colors.bg} />
                <Text style={styles.actionBtnText}>{t('clientDetails.assignWorkout')}</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={client?.workouts || []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 30 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.workoutCard}
                  onPress={() => navigation.navigate('WorkoutDetails', { workoutId: item.id })}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workoutName}>{item.name}</Text>
                    <Text style={styles.workoutDesc}>
                      {item.exercises?.length || 0} {t('clientDetails.exercisesCount')}
                      {item.description ? `  ·  ${item.description}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="barbell-outline" size={40} color={colors.muted} />
                  <Text style={styles.emptyText}>
                    {t('clientDetails.noWorkoutsAssigned')}
                  </Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={handleAssignWorkoutOptions}>
                    <Text style={styles.emptyBtnText}>{t('clientDetails.prescribeFirst')}</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        )}

        {/* SEPARADOR 2: HISTÓRICO DE SESSÕES */}
        {activeTab === 'history' && (
          <FlatList
            data={client?.logs || []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 30 }}
            renderItem={({ item }) => {
              const date = new Date(item.createdAt).toLocaleDateString(currentLocale, {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });

              // Agrupar séries por exercício
              const setsByExercise: Record<string, any[]> = {};
              (item.setLogs || []).forEach((set: any) => {
                const name = set.exerciseName || t('workouts.exerciseName');
                if (!setsByExercise[name]) setsByExercise[name] = [];
                setsByExercise[name].push(set);
              });

              return (
                <Card style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyName}>{item.workout?.name || t('history.workoutCompletedDefault')}</Text>
                    <Text style={styles.historyDuration}>{item.durationMinutes} min</Text>
                  </View>
                  <Text style={styles.historyDate}>{date}</Text>

                  {item.notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesLabel}>{t('workouts.studentFeedback')}:</Text>
                      <Text style={styles.notesText}>{item.notes}</Text>
                    </View>
                  ) : null}

                  {Object.keys(setsByExercise).length > 0 ? (
                    <View style={styles.historySetsContainer}>
                      {Object.entries(setsByExercise).map(([exName, sets]) => (
                        <View key={exName} style={styles.historyExerciseItem}>
                          <Text style={styles.historyExTitle}>{exName}</Text>
                          <Text style={styles.historyExSets}>
                            {sets.map((s) => `${s.reps} reps × ${s.weight || 0} kg`).join('  ·  ')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={40} color={colors.muted} />
                <Text style={styles.emptyText}>{t('clientDetails.noFinishedWorkouts')}</Text>
              </View>
            }
          />
        )}

        {/* SEPARADOR 3: NUTRIÇÃO & METAS */}
        {activeTab === 'nutrition' && (
          <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            {/* Cartão de Metas Nutricionais e de Treino */}
            <Card style={styles.goalsCard}>
              <View style={styles.goalsHeader}>
                <View>
                  <Text style={styles.goalsTitle}>{t('clientDetails.nutritionAndGoalsTitle')}</Text>
                  <Text style={styles.goalsSub}>{t('clientDetails.nutritionAndGoalsSub')}</Text>
                </View>
                <TouchableOpacity style={styles.editGoalsBtn} onPress={handleOpenGoalsModal}>
                  <Ionicons name="options-outline" size={16} color={colors.bg} />
                  <Text style={styles.editGoalsBtnText}>{t('clientDetails.adjust')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.macroGrid}>
                <View style={styles.macroBox}>
                  <Text style={styles.macroVal}>
                    {client?.dailyCalories ? `${client.dailyCalories}` : '--'}
                  </Text>
                  <Text style={styles.macroLabel}>{t('nutrition.calories')}</Text>
                </View>

                <View style={styles.macroBox}>
                  <Text style={styles.macroVal}>
                    {client?.dailyProtein ? `${client.dailyProtein}g` : '--'}
                  </Text>
                  <Text style={styles.macroLabel}>{t('nutrition.protein')}</Text>
                </View>

                <View style={styles.macroBox}>
                  <Text style={styles.macroVal}>
                    {client?.dailyCarbs ? `${client.dailyCarbs}g` : '--'}
                  </Text>
                  <Text style={styles.macroLabel}>{t('nutrition.carbs')}</Text>
                </View>

                <View style={styles.macroBox}>
                  <Text style={styles.macroVal}>
                    {client?.dailyFat ? `${client.dailyFat}g` : '--'}
                  </Text>
                  <Text style={styles.macroLabel}>{t('nutrition.fat')}</Text>
                </View>
              </View>
            </Card>

            {/* Filtro de Período: Hoje / Ontem / Histórico */}
            <View style={styles.nutritionFilterRow}>
              <TouchableOpacity
                style={[
                  styles.nutritionFilterChip,
                  nutritionFilter === 'today' && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setNutritionFilter('today')}
              >
                <Text
                  style={[
                    styles.nutritionFilterText,
                    nutritionFilter === 'today' && { color: colors.bg, fontWeight: '700' },
                  ]}
                >
                  Hoje ({todayMeals.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.nutritionFilterChip,
                  nutritionFilter === 'yesterday' && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setNutritionFilter('yesterday')}
              >
                <Text
                  style={[
                    styles.nutritionFilterText,
                    nutritionFilter === 'yesterday' && { color: colors.bg, fontWeight: '700' },
                  ]}
                >
                  Ontem ({yesterdayMeals.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.nutritionFilterChip,
                  nutritionFilter === 'all' && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setNutritionFilter('all')}
              >
                <Text
                  style={[
                    styles.nutritionFilterText,
                    nutritionFilter === 'all' && { color: colors.bg, fontWeight: '700' },
                  ]}
                >
                  Histórico ({clientMeals.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Resumo do Dia Selecionado (Hoje ou Ontem) */}
            {nutritionFilter !== 'all' && (
              <Card style={[styles.daySummaryCard, { borderColor: colors.border }]}>
                <View style={styles.daySummaryHeader}>
                  <Text style={[styles.daySummaryTitle, { color: colors.text }]}>
                    {nutritionFilter === 'today' ? 'Consumo de Hoje' : 'Consumo de Ontem'}
                  </Text>
                  <Text style={[styles.daySummaryCal, { color: colors.accent }]}>
                    {activeDayCalories} {client?.dailyCalories ? `/ ${client.dailyCalories}` : ''} kcal
                  </Text>
                </View>

                {client?.dailyCalories ? (
                  <View style={{ marginVertical: 8 }}>
                    <ProgressBar
                      value={Math.min(100, Math.round((activeDayCalories / client.dailyCalories) * 100))}
                    />
                  </View>
                ) : null}

                <View style={styles.dayMacroRow}>
                  <Text style={[styles.dayMacroText, { color: colors.muted }]}>
                    Proteína: <Text style={{ color: colors.text, fontWeight: '700' }}>{activeDayProtein}g</Text>
                  </Text>
                  <Text style={[styles.dayMacroText, { color: colors.muted }]}>
                    Carbs: <Text style={{ color: colors.text, fontWeight: '700' }}>{activeDayCarbs}g</Text>
                  </Text>
                  <Text style={[styles.dayMacroText, { color: colors.muted }]}>
                    Gordura: <Text style={{ color: colors.text, fontWeight: '700' }}>{activeDayFat}g</Text>
                  </Text>
                </View>
              </Card>
            )}

            {/* Lista para Hoje ou Ontem */}
            {nutritionFilter !== 'all' && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.tabSectionTitle}>
                    {nutritionFilter === 'today' ? 'Refeições de Hoje' : 'Refeições de Ontem'} ({activeDayMeals.length})
                  </Text>
                </View>

                {activeDayMeals.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="restaurant-outline" size={40} color={colors.muted} />
                    <Text style={styles.emptyText}>
                      {nutritionFilter === 'today'
                        ? 'O aluno ainda não registou refeições hoje.'
                        : 'Nenhuma refeição registada ontem.'}
                    </Text>
                  </View>
                ) : (
                  activeDayMeals.map((item: any) => {
                    const timeStr = new Date(item.createdAt).toLocaleTimeString(currentLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return (
                      <Card key={item.id} style={styles.mealCard}>
                        {item.imageUri ? (
                          <Image source={{ uri: item.imageUri }} style={styles.mealImage} />
                        ) : null}
                        <View style={styles.mealContent}>
                          <View style={styles.mealHeader}>
                            <Text style={styles.mealName}>{item.name}</Text>
                            <Text style={styles.mealCalories}>{item.calories} kcal</Text>
                          </View>
                          <Text style={styles.mealMacros}>
                            P: {item.protein}g  ·  C: {item.carbs}g  ·  G: {item.fat}g
                          </Text>
                          <Text style={styles.mealDate}>🕒 {timeStr}</Text>
                        </View>
                      </Card>
                    );
                  })
                )}
              </>
            )}

            {/* Lista para Histórico Completo */}
            {nutritionFilter === 'all' && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.tabSectionTitle}>
                    Histórico Completo de Refeições ({clientMeals.length})
                  </Text>
                </View>

                {groupedMeals.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="restaurant-outline" size={40} color={colors.muted} />
                    <Text style={styles.emptyText}>O aluno ainda não registou qualquer refeição.</Text>
                  </View>
                ) : (
                  groupedMeals.map((group) => (
                    <View key={group.dateKey} style={styles.dayGroupContainer}>
                      {/* Cabeçalho do Dia no Histórico */}
                      <View style={[styles.dayGroupHeader, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                          <Text style={[styles.dayGroupTitle, { color: colors.text }]}>{group.displayDate}</Text>
                        </View>
                        <Text style={[styles.dayGroupTotal, { color: colors.accent }]}>
                          {group.totalCalories} kcal
                        </Text>
                      </View>

                      {/* Refeições deste dia */}
                      {group.meals.map((item: any) => {
                        const timeStr = new Date(item.createdAt).toLocaleTimeString(currentLocale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        return (
                          <Card key={item.id} style={styles.mealCard}>
                            {item.imageUri ? (
                              <Image source={{ uri: item.imageUri }} style={styles.mealImage} />
                            ) : null}
                            <View style={styles.mealContent}>
                              <View style={styles.mealHeader}>
                                <Text style={styles.mealName}>{item.name}</Text>
                                <Text style={styles.mealCalories}>{item.calories} kcal</Text>
                              </View>
                              <Text style={styles.mealMacros}>
                                P: {item.protein}g  ·  C: {item.carbs}g  ·  G: {item.fat}g
                              </Text>
                              <Text style={styles.mealDate}>🕒 {timeStr}</Text>
                            </View>
                          </Card>
                        );
                      })}
                    </View>
                  ))
                )}
              </>
            )}
          </ScrollView>
        )}

        {/* SEPARADOR 4: AVALIAÇÃO FÍSICA E FOTOS */}
        {activeTab === 'weight' && (
          <View style={{ flex: 1 }}>
            <View style={styles.actionHeader}>
              <Text style={styles.tabSectionTitle}>{t('assessment.title')}</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={handleOpenAssessmentModal}>
                <Ionicons name="add" size={18} color={colors.bg} />
                <Text style={styles.actionBtnText}>{t('clientDetails.newAssessment')}</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={client?.bodyMetrics || []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 30 }}
              renderItem={({ item }) => {
                const date = new Date(item.createdAt).toLocaleDateString(currentLocale, {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });

                const hasMeasurements = item.chest || item.waist || item.arms || item.thighs;

                return (
                  <Card style={styles.assessmentCard}>
                    <View style={styles.assessmentTopRow}>
                      <View>
                        <Text style={styles.assessmentWeight}>{item.weight} kg</Text>
                        <Text style={styles.assessmentDate}>{date}</Text>
                      </View>
                      {item.bodyFat ? (
                        <View style={styles.bodyFatBadge}>
                          <Text style={styles.bodyFatText}>{item.bodyFat}% BF</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Medidas Corporais */}
                    {hasMeasurements ? (
                      <View style={styles.measurementsGrid}>
                        {item.chest ? (
                          <View style={styles.measurementItem}>
                            <Text style={styles.measurementVal}>{item.chest} cm</Text>
                            <Text style={styles.measurementLabel}>{t('assessment.chest')}</Text>
                          </View>
                        ) : null}
                        {item.waist ? (
                          <View style={styles.measurementItem}>
                            <Text style={styles.measurementVal}>{item.waist} cm</Text>
                            <Text style={styles.measurementLabel}>{t('assessment.waist')}</Text>
                          </View>
                        ) : null}
                        {item.arms ? (
                          <View style={styles.measurementItem}>
                            <Text style={styles.measurementVal}>{item.arms} cm</Text>
                            <Text style={styles.measurementLabel}>{t('assessment.arms')}</Text>
                          </View>
                        ) : null}
                        {item.thighs ? (
                          <View style={styles.measurementItem}>
                            <Text style={styles.measurementVal}>{item.thighs} cm</Text>
                            <Text style={styles.measurementLabel}>{t('assessment.thighs')}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Fotografia de Evolução */}
                    {item.photoUrl ? (
                      <View style={styles.photoContainer}>
                        <Image source={{ uri: item.photoUrl }} style={styles.evolutionPhoto} />
                      </View>
                    ) : null}

                    {/* Observações Técnicas */}
                    {item.notes ? (
                      <View style={styles.notesBox}>
                        <Text style={styles.notesLabel}>{t('clientDetails.technicalNotes')}:</Text>
                        <Text style={styles.notesText}>{item.notes}</Text>
                      </View>
                    ) : null}
                  </Card>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="fitness-outline" size={40} color={colors.muted} />
                  <Text style={styles.emptyText}>
                    {t('assessment.noAssessments')}
                  </Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={handleOpenAssessmentModal}>
                    <Text style={styles.emptyBtnText}>{t('clientDetails.recordAssessment')}</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        )}

        {/* SEPARADOR 5: CHECK-INS SEMANAIS DO ALUNO */}
        {activeTab === 'checkins' && (
          <View style={{ flex: 1 }}>
            <View style={styles.actionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tabSectionTitle}>{t('clientDetails.weeklyCheckInsTitle')}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {t('clientDetails.weeklyCheckInsSub')}
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: radius.full,
                  gap: 6,
                }}
                onPress={() => setIsPhotoCompareVisible(true)}
              >
                <Ionicons name="images-outline" size={16} color={colors.bg} />
                <Text style={{ color: colors.bg, fontSize: 13, fontWeight: '700' }}>{t('clientDetails.beforeAfterBtn')}</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={checkIns}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => {
                const date = new Date(item.createdAt).toLocaleDateString(currentLocale, {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });
                const hasPhotos = Boolean(item.frontPhotoUrl || item.backPhotoUrl || item.sidePhotoUrl);
                const hasPain = Boolean(typeof item.painLevel === 'number' && item.painLevel > 0);
                const draft = feedbackDrafts[item.id] !== undefined ? feedbackDrafts[item.id] : (item.coachFeedback || '');
                const isSending = !!isSendingFeedback[item.id];

                return (
                  <Card style={[styles.checkInAdminCard, { borderColor: hasPain ? '#EF4444' : colors.border }]}>
                    {/* Linha de Cabeçalho do Check-in */}
                    <View style={styles.checkInTopRow}>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.checkInAdminWeight}>{item.weight} kg</Text>
                          <View style={styles.checkInDateBadge}>
                            <Text style={styles.checkInDateText}>{date}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <View style={[styles.miniMetricBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                          <Text style={[styles.miniMetricText, { color: '#10B981' }]}>
                            {t('clientDetails.dietLabel')}: {item.dietAdherence}/10
                          </Text>
                        </View>
                        <View style={[styles.miniMetricBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                          <Text style={[styles.miniMetricText, { color: '#F59E0B' }]}>
                            {t('clientDetails.energyLabel')}: {item.energyLevel}/10
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Alerta de Dor se existir */}
                    {hasPain ? (
                      <View style={styles.painAlertBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="warning" size={18} color="#EF4444" />
                          <Text style={styles.painAlertTitle}>
                            {t('clientDetails.painAlertLevel', { val: item.painLevel })}
                          </Text>
                        </View>
                        <Text style={styles.painAlertDesc}>
                          {item.painNotes || t('clientDetails.noPainDetails')}
                        </Text>
                      </View>
                    ) : null}

                    {/* Notas do Aluno */}
                    {item.notes ? (
                      <View style={styles.checkInNotesBox}>
                        <Text style={styles.notesLabel}>{t('clientDetails.studentComments')}</Text>
                        <Text style={styles.notesText}>{item.notes}</Text>
                      </View>
                    ) : null}

                    {/* Fotos de Evolução (Frente, Costas, Lateral) */}
                    {hasPhotos ? (
                      <View style={styles.checkInPhotosSection}>
                        <Text style={styles.notesLabel}>{t('clientDetails.evolutionPhotos')}</Text>
                        <View style={styles.checkInPhotosRow}>
                          {item.frontPhotoUrl ? (
                            <View style={styles.checkInPhotoWrap}>
                              <Image source={{ uri: item.frontPhotoUrl }} style={styles.checkInPhoto} />
                              <Text style={styles.photoTag}>{t('weeklyCheckIn.front')}</Text>
                            </View>
                          ) : null}
                          {item.backPhotoUrl ? (
                            <View style={styles.checkInPhotoWrap}>
                              <Image source={{ uri: item.backPhotoUrl }} style={styles.checkInPhoto} />
                              <Text style={styles.photoTag}>{t('weeklyCheckIn.back')}</Text>
                            </View>
                          ) : null}
                          {item.sidePhotoUrl ? (
                            <View style={styles.checkInPhotoWrap}>
                              <Image source={{ uri: item.sidePhotoUrl }} style={styles.checkInPhoto} />
                              <Text style={styles.photoTag}>{t('weeklyCheckIn.side')}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ) : null}

                    {/* Secção de Feedback do Treinador */}
                    <View style={styles.feedbackSection}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={styles.feedbackSectionTitle}>{t('checkin.feedbackTitle')}</Text>
                        {item.reviewedAt ? (
                          <Text style={{ color: colors.muted, fontSize: 11 }}>
                            {t('clientDetails.sentOn', { date: new Date(item.reviewedAt).toLocaleDateString(currentLocale) })}
                          </Text>
                        ) : null}
                      </View>

                      <TextInput
                        style={[styles.feedbackInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                        placeholder={t('checkin.feedbackPlaceholder')}
                        placeholderTextColor={colors.muted}
                        multiline
                        numberOfLines={3}
                        value={draft}
                        onChangeText={(txt) => setFeedbackDrafts((prev) => ({ ...prev, [item.id]: txt }))}
                      />

                      <TouchableOpacity
                        onPress={() => handleSendFeedback(item.id)}
                        disabled={isSending}
                        style={[styles.sendFeedbackBtn, { backgroundColor: colors.accent }]}
                      >
                        {isSending ? (
                          <ActivityIndicator size="small" color={colors.bg} />
                        ) : (
                          <>
                            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.bg} style={{ marginRight: 6 }} />
                            <Text style={styles.sendFeedbackBtnText}>
                              {item.coachFeedback ? t('checkin.sendFeedbackBtn') : t('checkin.sendFeedbackBtn')}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="clipboard-outline" size={42} color={colors.muted} />
                  <Text style={styles.emptyTitle}>{t('checkin.emptyTitle')}</Text>
                  <Text style={styles.emptyText}>
                    {t('checkin.emptyText')}
                  </Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={handleSendPushReminder}>
                    <Text style={styles.emptyBtnText}>{t('checkin.sendPushBtn')}</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        )}

        {/* SEPARADOR 6: GRÁFICOS VISUAIS DE EVOLUÇÃO (CHARTS) */}
        {activeTab === 'charts' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* 1. Gráfico de Evolução do Peso Corporal */}
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.tabSectionTitle}>{t('analytics.weightEvolution')}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>
                {t('analytics.coachChartsSubtitle')}
              </Text>
              <LineChart
                title={t('analytics.weightEvolution')}
                unit="kg"
                data={
                  analytics?.weightHistory?.map((w) => ({
                    date: w.date,
                    value: w.weight,
                  })) || []
                }
                color={colors.accent}
                height={210}
                emptyText={t('analytics.weightEmptyPrompt')}
              />
            </View>

            {/* 2. Gráfico de Progressão de Carga & 1RM Estimado */}
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.tabSectionTitle}>{t('analytics.strengthEvolution')}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>
                {t('analytics.coachChartsSubtitle')}
              </Text>

              {/* Seletor de Exercícios */}
              {analytics?.strengthHistory && analytics.strengthHistory.length > 0 ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {analytics.strengthHistory.map((ex) => {
                        const isSelected = selectedExerciseName === ex.exerciseName;
                        return (
                          <TouchableOpacity
                            key={ex.exerciseName}
                            onPress={() => setSelectedExerciseName(ex.exerciseName)}
                            style={[
                              styles.exerciseChip,
                              {
                                backgroundColor: isSelected ? colors.accent : colors.surface,
                                borderColor: isSelected ? colors.accent : colors.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.exerciseChipText,
                                { color: isSelected ? colors.bg : colors.text, fontWeight: isSelected ? '700' : '500' },
                              ]}
                            >
                              {ex.exerciseName} ({ex.dataPointsCount})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Componente Gráfico 1RM do Exercício Selecionado */}
                  {(() => {
                    const currentEx =
                      analytics.strengthHistory.find((e) => e.exerciseName === selectedExerciseName) ||
                      analytics.strengthHistory[0];

                    const chartPoints =
                      currentEx?.sessions.map((s: any) => ({
                        date: s.date,
                        value: s.estimated1RM,
                        extra: `${s.maxWeight}kg x ${s.reps}`,
                      })) || [];

                    return (
                      <LineChart
                        title={`${t('analytics.estimated1RM')}: ${currentEx?.exerciseName || ''}`}
                        unit="kg"
                        data={chartPoints}
                        color="#10B981"
                        height={210}
                        emptyText={t('analytics.noSessionsCompleted')}
                      />
                    );
                  })()}
                </>
              ) : (
                <Card style={{ padding: 24, alignItems: 'center', borderColor: colors.border }}>
                  <Ionicons name="barbell-outline" size={36} color={colors.muted} />
                  <Text style={{ color: colors.text, fontWeight: '700', marginTop: 8 }}>
                    Sem treinos com cargas registados
                  </Text>
                  <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13, marginTop: 4 }}>
                    Assim que o aluno completar treinos e registar séries com peso e repetições, os gráficos de 1RM serão gerados aqui automaticamente.
                  </Text>
                </Card>
              )}
            </View>
          </ScrollView>
        )}

        {/* MODAL 1: SELECIONAR MODELO DE TREINO */}
        <Modal
          visible={isTemplateModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsTemplateModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{t('templates.title')}</Text>
                  <Text style={styles.modalSub}>{t('clientDetails.selectTemplateSub')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsTemplateModalVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              {isLoadingTemplates ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.accent} />
                </View>
              ) : (
                <FlatList
                  data={templates}
                  keyExtractor={(t) => t.id}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.templateItem}
                      activeOpacity={0.8}
                      onPress={() => handleAssignTemplate(item)}
                      disabled={isAssigningTemplate}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.templateItemTitle}>{item.name}</Text>
                          {item.category ? (
                            <View style={styles.categoryBadge}>
                              <Text style={styles.categoryBadgeText}>{item.category}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.templateItemDesc}>
                          {item.exercises?.length || 0} {t('clientDetails.exercisesCount')}
                          {item.description ? `  ·  ${item.description}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Ionicons name="document-text-outline" size={36} color={colors.muted} />
                      <Text style={styles.emptyText}>
                        {t('templates.emptyTitle')}
                      </Text>
                      <TouchableOpacity
                        style={styles.emptyBtn}
                        onPress={() => {
                          setIsTemplateModalVisible(false);
                          navigation.navigate('CreateWorkout', { isTemplate: true });
                        }}
                      >
                        <Text style={styles.emptyBtnText}>{t('templates.createTemplate')}</Text>
                      </TouchableOpacity>
                    </View>
                  }
                />
              )}
            </View>
          </View>
        </Modal>

        {/* MODAL 2: AJUSTAR METAS DO ALUNO */}
        <Modal
          visible={isGoalsModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsGoalsModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{t('clientDetails.modalGoalsTitle')}</Text>
                  <Text style={styles.modalSub}>{t('clientDetails.modalGoalsSub')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsGoalsModalVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('clientDetails.dailyCalories')}</Text>
                  <TextInput
                    style={styles.input}
                    value={goalCalories}
                    onChangeText={setGoalCalories}
                    placeholder="Ex: 2400"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('clientDetails.dailyProtein')}</Text>
                    <TextInput
                      style={styles.input}
                      value={goalProtein}
                      onChangeText={setGoalProtein}
                      placeholder="Ex: 160"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('clientDetails.dailyCarbs')}</Text>
                    <TextInput
                      style={styles.input}
                      value={goalCarbs}
                      onChangeText={setGoalCarbs}
                      placeholder="Ex: 220"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('clientDetails.dailyFat')}</Text>
                    <TextInput
                      style={styles.input}
                      value={goalFat}
                      onChangeText={setGoalFat}
                      placeholder="Ex: 65"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('clientDetails.weeklySessions')}</Text>
                  <TextInput
                    style={styles.input}
                    value={goalWeekly}
                    onChangeText={setGoalWeekly}
                    placeholder="Ex: 4"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setIsGoalsModalVisible(false)}
                    disabled={isSavingGoals}
                  >
                    <Text style={styles.modalCancelBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalSubmitBtn}
                    onPress={handleSaveGoals}
                    disabled={isSavingGoals}
                  >
                    {isSavingGoals ? (
                      <ActivityIndicator size="small" color={colors.bg} />
                    ) : (
                      <Text style={styles.modalSubmitBtnText}>{t('clientDetails.saveGoals')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* MODAL 3: NOVA AVALIAÇÃO CORPORAL */}
        <Modal
          visible={isAssessmentModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsAssessmentModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{t('clientDetails.newAssessment')}</Text>
                  <Text style={styles.modalSub}>{t('clientDetails.modalAssessmentSub')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsAssessmentModalVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('assessment.weight')} *</Text>
                    <TextInput
                      style={styles.input}
                      value={assessmentWeight}
                      onChangeText={setAssessmentWeight}
                      placeholder="Ex: 76.5"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('assessment.bodyFat')}</Text>
                    <TextInput
                      style={styles.input}
                      value={assessmentBodyFat}
                      onChangeText={setAssessmentBodyFat}
                      placeholder="Ex: 14.5"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <Text style={styles.sectionSubtitle}>{t('clientDetails.bodyPerimeters')}</Text>
                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('assessment.chest')}</Text>
                    <TextInput
                      style={styles.input}
                      value={assessmentChest}
                      onChangeText={setAssessmentChest}
                      placeholder="Ex: 102"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('assessment.waist')}</Text>
                    <TextInput
                      style={styles.input}
                      value={assessmentWaist}
                      onChangeText={setAssessmentWaist}
                      placeholder="Ex: 82"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('assessment.arms')}</Text>
                    <TextInput
                      style={styles.input}
                      value={assessmentArms}
                      onChangeText={setAssessmentArms}
                      placeholder="Ex: 38"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>{t('assessment.thighs')}</Text>
                    <TextInput
                      style={styles.input}
                      value={assessmentThighs}
                      onChangeText={setAssessmentThighs}
                      placeholder="Ex: 58"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Fotografia de Evolução */}
                <Text style={styles.sectionSubtitle}>{t('clientDetails.evolutionPhoto')}</Text>
                {assessmentPhotoUri ? (
                  <View style={styles.photoPreviewContainer}>
                    <Image source={{ uri: assessmentPhotoUri }} style={styles.photoPreview} />
                    <TouchableOpacity
                      style={styles.removePhotoBtn}
                      onPress={() => {
                        setAssessmentPhotoUri(null);
                        setAssessmentPhotoBase64(null);
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      <Text style={styles.removePhotoText}>{t('clientDetails.removePhoto')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.pickPhotoBtn}
                    onPress={handlePickAssessmentPhoto}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera-outline" size={22} color={colors.accent} />
                    <Text style={styles.pickPhotoBtnText}>{t('clientDetails.takeOrPickPhoto')}</Text>
                  </TouchableOpacity>
                )}

                {/* Notas e Observações */}
                <View style={[styles.inputGroup, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>{t('clientDetails.technicalNotes')}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={assessmentNotes}
                    onChangeText={setAssessmentNotes}
                    placeholder="Observações de postura, simetria muscular, etc."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setIsAssessmentModalVisible(false)}
                    disabled={isSavingAssessment}
                  >
                    <Text style={styles.modalCancelBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalSubmitBtn}
                    onPress={handleSaveAssessment}
                    disabled={isSavingAssessment}
                  >
                    {isSavingAssessment ? (
                      <ActivityIndicator size="small" color={colors.bg} />
                    ) : (
                      <Text style={styles.modalSubmitBtnText}>{t('clientDetails.recordAssessment')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <PhotoCompareModal
          visible={isPhotoCompareVisible}
          onClose={() => setIsPhotoCompareVisible(false)}
          clientId={clientId}
          clientName={client?.name || 'Aluno'}
        />
      </View>
    </Screen>
  );
}

const getStyles = (colors: ColorScheme) => StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  profileCard: {
    padding: 16,
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '800',
  },
  profileText: {
    flex: 1,
  },
  clientName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  clientEmail: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    backgroundColor: colors.border,
    height: '80%',
    alignSelf: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.bg,
    fontWeight: '700',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tabSectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  actionBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  actionBtnText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '700',
  },
  workoutCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  workoutDesc: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  historyCard: {
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  historyDuration: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  historyDate: {
    color: colors.muted,
    fontSize: 12,
  },
  notesBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  notesLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  notesText: {
    color: colors.text,
    fontSize: 13,
  },
  historySetsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  historyExerciseItem: {
    backgroundColor: colors.surface2,
    padding: 8,
    borderRadius: radius.sm,
  },
  historyExTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyExSets: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  // Nutrição
  goalsCard: {
    padding: 16,
    marginBottom: 18,
  },
  goalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  goalsTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  goalsSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  editGoalsBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 4,
  },
  editGoalsBtnText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '700',
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  macroBox: {
    flex: 1,
    backgroundColor: colors.surface2,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  macroVal: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  macroLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  mealCard: {
    marginBottom: 12,
    overflow: 'hidden',
  },
  mealImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  mealContent: {
    gap: 4,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  mealCalories: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  mealMacros: {
    color: colors.muted,
    fontSize: 12,
  },
  mealDate: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  // Avaliação Física
  assessmentCard: {
    padding: 16,
    marginBottom: 12,
  },
  assessmentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  assessmentWeight: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  assessmentDate: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  bodyFatBadge: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
  },
  bodyFatText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  measurementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    backgroundColor: colors.surface2,
    padding: 10,
    borderRadius: radius.sm,
  },
  measurementItem: {
    flex: 1,
    minWidth: '22%',
    alignItems: 'center',
  },
  measurementVal: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  measurementLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  photoContainer: {
    marginTop: 8,
    marginBottom: 10,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  evolutionPhoto: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
  },
  // Modais
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  templateItemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  templateItemDesc: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  categoryBadge: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  categoryBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  // Form elements
  inputGroup: {
    marginBottom: 14,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  sectionSubtitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 10,
  },
  pickPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  pickPhotoBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  photoPreviewContainer: {
    alignItems: 'center',
    gap: 10,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  removePhotoText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSubmitBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  emptyBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  tabsScrollContent: {
    paddingRight: 20,
    gap: 8,
  },
  checkInAdminCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  checkInTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkInAdminWeight: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  checkInDateBadge: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  checkInDateText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  miniMetricBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  miniMetricText: {
    fontSize: 11,
    fontWeight: '700',
  },
  painAlertBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 10,
    marginBottom: 10,
  },
  painAlertTitle: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  painAlertDesc: {
    color: colors.text,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  checkInNotesBox: {
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  checkInPhotosSection: {
    marginTop: 6,
    marginBottom: 12,
  },
  checkInPhotosRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  checkInPhotoWrap: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  checkInPhoto: {
    width: '100%',
    height: '100%',
  },
  photoTag: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  feedbackSection: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feedbackSectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  sendFeedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  sendFeedbackBtnText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  exerciseChipText: {
    fontSize: 12,
  },
  nutritionFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  nutritionFilterChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionFilterText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  daySummaryCard: {
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  daySummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daySummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  daySummaryCal: {
    fontSize: 14,
    fontWeight: '800',
  },
  dayMacroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayMacroText: {
    fontSize: 12,
  },
  dayGroupContainer: {
    marginBottom: 16,
  },
  dayGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  dayGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  dayGroupTotal: {
    fontSize: 13,
    fontWeight: '700',
  },
});

