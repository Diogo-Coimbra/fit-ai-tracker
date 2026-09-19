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
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Card, ProgressBar, Screen } from '../components/ui';
import { useAuthStore } from '../store/useAuthStore';
import { ColorScheme, radius, space } from '../theme';
import { api } from '../services/api';
import InviteModal from '../components/InviteModal';
import SubscriptionPaywallModal from '../components/SubscriptionPaywallModal';
import { WeeklyCheckInModal } from '../components/WeeklyCheckInModal';
import { useTheme } from '../store/useThemeStore';
import { useLanguage } from '../store/useLanguageStore';

export default function DashboardScreen({ navigation }: any) {
  const { user, trial, coach, setUser, setTrial, setCoach } = useAuthStore();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const isCoach = user?.role === 'COACH';
  const isLocked = isCoach && !!trial?.isExpired && user?.subscriptionStatus !== 'active';

  // Estados Comuns
  const [isLoading, setIsLoading] = useState(true);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // Enviar Lembrete / Push para Aluno Inativo
  const handleSendInactiveReminder = async (clientId: string, clientName: string) => {
    Alert.alert(
      'Enviar Lembrete de Treino',
      `Desejas enviar uma notificação push a incentivar ${clientName} a regressar aos treinos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar Notificação 🔔',
          onPress: async () => {
            try {
              await api.post('/api/coach/notify-inactive', { clientId });
              Alert.alert('Sucesso', `Notificação de incentivo enviada a ${clientName}!`);
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Erro ao enviar lembrete.');
            }
          },
        },
      ]
    );
  };

  // Estados do Treinador (COACH)
  const [clients, setClients] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Estados do Aluno (CLIENT)
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [selectedRoutineFilter, setSelectedRoutineFilter] = useState<string>('ALL');
  const [totalLogs, setTotalLogs] = useState(0);
  const [weeklyLogs, setWeeklyLogs] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);

  const WEEKLY_GOAL = user?.weeklyGoal || 3;

  const fetchCoachData = async () => {
    try {
      setIsLoading(true);
      const [clientsData, meData] = await Promise.all([
        api.get('/api/coach/clients'),
        api.get('/api/auth/me'),
      ]);
      setClients(clientsData || []);
      if (meData?.user) setUser(meData.user);
      if (meData?.trial) setTrial(meData.trial);
    } catch (error: any) {
      console.error('Erro ao carregar clientes do PT:', error);
      try {
        const meData = await api.get('/api/auth/me');
        if (meData?.user) setUser(meData.user);
        if (meData?.trial) setTrial(meData.trial);
      } catch (meErr) {
        // silencia
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClientData = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);

      const [workoutsData, logsData, meData] = await Promise.all([
        api.get('/api/workouts'),
        api.get(`/api/logs/${user.id}`),
        api.get('/api/auth/me').catch(() => null),
      ]);

      if (meData?.user) setUser(meData.user);
      if (meData?.coach !== undefined) await setCoach(meData.coach);
      if (meData?.trial) setTrial(meData.trial);

      setWorkouts(workoutsData || []);
      setTotalLogs(logsData.length || 0);

      const summedMinutes = logsData.reduce((acc: number, log: any) => {
        return acc + (log.durationMinutes || 0);
      }, 0);
      setTotalMinutes(summedMinutes);

      const now = new Date();
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const thisWeekLogs = logsData.filter((log: any) => {
        const logDate = new Date(log.createdAt);
        return logDate >= monday && logDate <= sunday;
      });

      setWeeklyLogs(thisWeekLogs.length);
    } catch (error) {
      console.error('Erro ao carregar painel do cliente:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (isCoach) {
        fetchCoachData();
      } else {
        fetchClientData();
      }
    }, [isCoach, user?.id])
  );

  const formatTotalTime = (mins: number) => {
    if (mins === 0) return '0m';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const firstName = user?.name?.split(' ')[0] || 'Treinador';
  const initial = (user?.name || 'U').charAt(0).toUpperCase();

  // ==========================================
  // RENDER: VISTA DO PERSONAL TRAINER (COACH)
  // ==========================================
  if (isCoach) {
    const totalWeeklyClientWorkouts = clients.reduce(
      (sum, c) => sum + (c.weeklyWorkoutsCount || 0),
      0
    );

    const atRiskClients = clients.filter(
      (c) => c.retentionStatus === 'at_risk' || c.retentionStatus === 'warning'
    );

    const renderClientCard = ({ item }: any) => {
      const clientInitial = (item.name || 'A').charAt(0).toUpperCase();
      const isAtRisk = item.retentionStatus === 'at_risk';
      const isWarning = item.retentionStatus === 'warning';

      return (
        <TouchableOpacity
          style={styles.clientCard}
          onPress={() => navigation.navigate('ClientDetails', { clientId: item.id })}
          activeOpacity={0.8}
        >
          {item.picture ? (
            <Image source={{ uri: item.picture }} style={styles.clientAvatar} />
          ) : (
            <View style={styles.clientAvatarFallback}>
              <Text style={styles.clientAvatarLetter}>{clientInitial}</Text>
            </View>
          )}

          <View style={styles.clientInfo}>
            <View style={styles.clientNameRow}>
              <Text style={styles.clientName}>{item.name}</Text>
              {isAtRisk ? (
                <View style={styles.riskBadge}>
                  <Text style={styles.riskBadgeText}>
                    {item.daysSinceLastWorkout !== null
                      ? `${t('dashboard.inactiveFor')} ${item.daysSinceLastWorkout}d`
                      : t('dashboard.noWorkoutsYet')}
                  </Text>
                </View>
              ) : isWarning ? (
                <View style={styles.warningBadge}>
                  <Text style={styles.warningBadgeText}>
                    {`${t('dashboard.inactiveFor')} ${item.daysSinceLastWorkout}d`}
                  </Text>
                </View>
              ) : item.weeklyGoalMet ? (
                <View style={styles.goalBadge}>
                  <Text style={styles.goalBadgeText}>{t('dashboard.goalMet')}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.clientSubRow}>
              <Text style={styles.clientSubText}>
                {item.weeklyWorkoutsCount || 0}/{item.weeklyGoal || 3} {t('dashboard.workoutsThisWeek')}
              </Text>
              {item.latestWeight ? (
                <Text style={styles.clientWeightBadge}> · {item.latestWeight} kg</Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={() =>
                navigation.navigate('Chat', {
                  targetUserId: item.id,
                  targetUserName: item.name || 'Aluno',
                  targetUserRole: 'Aluno',
                })
              }
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accent} />
            </TouchableOpacity>
            <View style={styles.clientAction}>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <Screen>
        <FlatList
          data={clients}
          keyExtractor={(item) => item.id}
          renderItem={renderClientCard}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              {/* Header */}
              <View style={styles.header}>
                <View>
                  <View style={styles.roleTag}>
                    <Text style={styles.roleTagText}>{t('dashboard.roleCoach')}</Text>
                  </View>
                  <Text style={styles.hello}>{t('dashboard.hello')}, {firstName}</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.avatarBtn}>
                  {user?.picture ? (
                    <Image source={{ uri: user.picture }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarLetter}>{initial}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Banner de Subscrição / Trial */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowPaywallModal(true)}
              >
                <Card style={styles.trialCard}>
                  <View style={styles.trialContent}>
                    <Ionicons
                      name={user?.subscriptionStatus === 'active' ? 'checkmark-circle' : 'shield-checkmark-outline'}
                      size={20}
                      color={colors.accent}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.trialTitle}>
                        {user?.subscriptionStatus === 'active'
                          ? t('dashboard.proSubscriptionActive')
                          : t('dashboard.proSubscriptionTitle')}
                      </Text>
                      <Text style={styles.trialDesc}>
                        {user?.subscriptionStatus === 'active'
                          ? t('dashboard.proAccessDesc')
                          : trial?.daysLeft !== undefined
                          ? t('dashboard.trialDaysLeftDesc', { days: trial.daysLeft })
                          : t('dashboard.trialActiveDesc')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </View>
                </Card>
              </TouchableOpacity>

              {/* Alertas de Retenção & Acompanhamento (se houver alunos inativos) */}
              {atRiskClients.length > 0 && (
                <Card style={styles.alertsCard}>
                  <View style={styles.alertsHeader}>
                    <View style={styles.alertsTitleRow}>
                      <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.alertsTitle}>{t('dashboard.alertsTitle')}</Text>
                    </View>
                    <View style={styles.alertsCountBadge}>
                      <Text style={styles.alertsCountText}>{atRiskClients.length}</Text>
                    </View>
                  </View>
                  <Text style={styles.alertsSubtitle}>
                    {t('dashboard.alertsSubtitle')}
                  </Text>
                  <View style={styles.alertsList}>
                    {atRiskClients.slice(0, 3).map((client) => (
                      <View key={client.id} style={styles.alertRowContainer}>
                        <TouchableOpacity
                          style={styles.alertItem}
                          onPress={() => navigation.navigate('ClientDetails', { clientId: client.id })}
                        >
                          <View style={styles.alertItemInfo}>
                            <Text style={styles.alertItemName}>{client.name}</Text>
                            <Text style={styles.alertItemDesc}>
                              {client.daysSinceLastWorkout !== null
                                ? t('dashboard.lastWorkoutDays', { days: client.daysSinceLastWorkout })
                                : t('dashboard.notStartedYet')}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.pingBtn}
                          onPress={() => handleSendInactiveReminder(client.id, client.name)}
                        >
                          <Ionicons name="notifications-outline" size={18} color={colors.accent} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </Card>
              )}

              {/* Métricas do PT */}
              <View style={styles.statsRow}>
                <Card style={styles.statCard}>
                  <Text style={styles.statValue}>{clients.length}</Text>
                  <Text style={styles.statLabel}>{t('dashboard.activeClients')}</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Text style={styles.statValue}>{totalWeeklyClientWorkouts}</Text>
                  <Text style={styles.statLabel}>{t('dashboard.clientWorkoutsWeek')}</Text>
                </Card>
              </View>

              {/* Botões de Ação Rápida */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.action, styles.actionPrimary]}
                  onPress={() => setShowInviteModal(true)}
                >
                  <Ionicons name="person-add" size={18} color={colors.bg} />
                  <Text style={styles.actionPrimaryText}>{t('dashboard.inviteStudent')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.action}
                  onPress={() => navigation.navigate('Templates')}
                >
                  <Ionicons name="library-outline" size={19} color={colors.accent} />
                  <Text style={styles.actionText}>{t('dashboard.templates')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.action}
                  onPress={() => navigation.navigate('CreateWorkout', { isTemplate: true })}
                >
                  <Ionicons name="add" size={20} color={colors.accent} />
                  <Text style={styles.actionText}>{t('dashboard.createWorkout')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.action}
                  onPress={() => navigation.navigate('AIGenerator')}
                >
                  <Ionicons name="flash-outline" size={20} color={colors.accent} />
                  <Text style={styles.actionText}>{t('dashboard.aiGenerator')}</Text>
                </TouchableOpacity>
              </View>

              {/* Título da Lista de Clientes */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('dashboard.myStudents')}</Text>
                <Text style={styles.sectionCount}>({clients.length})</Text>
              </View>

              {isLoading && <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />}
            </View>
          }
          ListEmptyComponent={
            isLoading ? null : (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={44} color={colors.muted} />
                <Text style={styles.emptyTitle}>{t('dashboard.noStudents')}</Text>
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => setShowInviteModal(true)}
                >
                  <Text style={styles.inviteButtonText}>{t('dashboard.emptyInviteBtn')}</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />

        {/* Modal de Convite */}
        <InviteModal
          visible={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          onClientAdded={fetchCoachData}
        />

        {/* Modal Paywall / Subscrição Stripe */}
        <SubscriptionPaywallModal
          visible={isLocked || showPaywallModal}
          canDismiss={!isLocked}
          onDismiss={() => setShowPaywallModal(false)}
        />
      </Screen>
    );
  }

  // ==========================================
  // RENDER: VISTA DO ALUNO / CLIENTE
  // ==========================================
  const remaining = Math.max(WEEKLY_GOAL - weeklyLogs, 0);
  let weeklyCopy = t('dashboard.startWeekCopy');
  if (weeklyLogs > 0 && weeklyLogs < WEEKLY_GOAL) {
    weeklyCopy = t('dashboard.remainingWorkouts', { count: remaining });
  } else if (weeklyLogs >= WEEKLY_GOAL) {
    weeklyCopy = t('dashboard.goalMetCopy');
  }

  const progressPercent = Math.min((weeklyLogs / WEEKLY_GOAL) * 100, 100);

  const availableRoutineTags = Array.from(new Set(workouts.map((w: any) => w.routineTag).filter(Boolean))).sort();
  const displayedWorkouts = selectedRoutineFilter === 'ALL' ? workouts : workouts.filter((w: any) => w.routineTag === selectedRoutineFilter);

  const renderWorkoutCard = ({ item }: any) => (
    <TouchableOpacity
      style={styles.workoutCard}
      onPress={() => navigation.navigate('WorkoutDetails', { workoutId: item.id })}
      activeOpacity={0.8}
    >
      <View style={styles.workoutText}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          {item.routineTag ? (
            <View style={{ backgroundColor: colors.accent + '25', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>DIVISÃO {item.routineTag}</Text>
            </View>
          ) : null}
          {item.programName ? (
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{item.programName}</Text>
          ) : null}
        </View>
        <Text style={styles.workoutName}>{item.name}</Text>
        <Text style={styles.workoutDescription} numberOfLines={1}>
          {item.assignedBy?.name
            ? t('dashboard.assignedByCoach', { name: item.assignedBy.name })
            : item.description || t('dashboard.individualPlan')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </TouchableOpacity>
  );

  return (
    <Screen>
      <FlatList
        data={displayedWorkouts}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkoutCard}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.kicker}>{t('dashboard.myDashboard')}</Text>
                <Text style={styles.hello}>{t('dashboard.hello')}, {firstName}</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.avatarBtn}>
                {user?.picture ? (
                  <Image source={{ uri: user.picture }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarLetter}>{initial}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Banner de Treinador Associado com Acesso ao Chat */}
            {coach ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate('Chat', {
                    targetUserId: coach.id,
                    targetUserName: coach.name,
                    targetUserRole: 'Personal Trainer',
                  })
                }
              >
                <Card style={styles.coachBanner}>
                  <Ionicons name="shield-checkmark" size={22} color={colors.accent} />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.coachBannerTitle}>{t('dashboard.yourCoach')}</Text>
                    <Text style={styles.coachBannerName}>{coach.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent + '20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 4 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.accent} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>Chat</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ) : null}

            {/* Cartões de Estatísticas */}
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{totalLogs}</Text>
                <Text style={styles.statLabel}>{t('dashboard.workoutsCompletedClient')}</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{formatTotalTime(totalMinutes)}</Text>
                <Text style={styles.statLabel}>{t('dashboard.trainingTime')}</Text>
              </Card>
            </View>

            {/* Cartão de Progresso Semanal */}
            <Card style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <Text style={styles.weekTitle}>{t('dashboard.thisWeek')}</Text>
                <Text style={styles.weekCount}>
                  {weeklyLogs}/{WEEKLY_GOAL}
                </Text>
              </View>
              <ProgressBar value={progressPercent} />
              <View style={styles.weekFooter}>
                <Text style={styles.weekCopy}>{weeklyCopy}</Text>
                {(user?.currentStreak || 0) > 0 ? (
                  <View style={styles.streakBadge}>
                    <Ionicons name="flame-outline" size={13} color={colors.accent} />
                    <Text style={styles.streak}>{user?.currentStreak} {t('dashboard.weeksInARow')}</Text>
                  </View>
                ) : null}
              </View>
            </Card>

            {/* Banner de Check-in Semanal */}
            <TouchableOpacity onPress={() => setShowCheckInModal(true)} style={styles.checkInCardWrap}>
              <Card style={[styles.checkInCard, { borderColor: colors.accent }]}>
                <View style={styles.checkInRow}>
                  <View style={[styles.checkInIconBadge, { backgroundColor: colors.accent }]}>
                    <Ionicons name="clipboard-outline" size={20} color={colors.bg} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.checkInTitle}>📋 {t('checkin.title')}</Text>
                    <Text style={styles.checkInSubtitle}>
                      {t('checkin.bannerSubtitle')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </View>
              </Card>
            </TouchableOpacity>

            {/* Ações do Cliente */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.action} onPress={() => navigation.navigate('Nutrition')}>
                <Ionicons name="restaurant-outline" size={20} color={colors.accent} />
                <Text style={styles.actionText}>{t('dashboard.nutritionAndPhotos')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => navigation.navigate('History')}>
                <Ionicons name="time-outline" size={20} color={colors.accent} />
                <Text style={styles.actionText}>{t('dashboard.history')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => navigation.navigate('Profile')}>
                <Ionicons name="scale-outline" size={20} color={colors.accent} />
                <Text style={styles.actionText}>{t('dashboard.metricsWeight')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.studentWorkoutsTitle}>{t('dashboard.assignedWorkouts')}</Text>

            {availableRoutineTags.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}
                style={{ marginBottom: 12 }}
              >
                <TouchableOpacity
                  style={[
                    styles.routineChip,
                    { backgroundColor: colors.bg, borderColor: colors.border },
                    selectedRoutineFilter === 'ALL' && { backgroundColor: colors.accent, borderColor: colors.accent },
                  ]}
                  onPress={() => setSelectedRoutineFilter('ALL')}
                >
                  <Text
                    style={[
                      styles.routineChipText,
                      { color: colors.text },
                      selectedRoutineFilter === 'ALL' && { color: colors.bg, fontWeight: '700' },
                    ]}
                  >
                    Todos ({workouts.length})
                  </Text>
                </TouchableOpacity>
                {availableRoutineTags.map((tag: any) => (
                  <TouchableOpacity
                    key={`tag-${tag}`}
                    style={[
                      styles.routineChip,
                      { backgroundColor: colors.bg, borderColor: colors.border },
                      selectedRoutineFilter === tag && { backgroundColor: colors.accent, borderColor: colors.accent },
                    ]}
                    onPress={() => setSelectedRoutineFilter(tag)}
                  >
                    <Text
                      style={[
                        styles.routineChipText,
                        { color: colors.text },
                        selectedRoutineFilter === tag && { color: colors.bg, fontWeight: '700' },
                      ]}
                    >
                      Treino {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {isLoading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.emptyWorkoutsContainer}>
              <Ionicons name="barbell-outline" size={44} color={colors.muted} style={{ marginBottom: 10, opacity: 0.6 }} />
              <Text style={styles.empty}>
                {t('dashboard.noWorkoutsAssigned')}
              </Text>
            </View>
          )
        }
      />

      <WeeklyCheckInModal
        visible={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        onSuccess={() => fetchClientData()}
      />
    </Screen>
  );
}

const getStyles = (colors: ColorScheme) => StyleSheet.create({
  list: {
    paddingHorizontal: space.lg,
    paddingBottom: 40,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  roleTag: {
    backgroundColor: colors.surface2,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  roleTagText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  hello: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: {
    flex: 1,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.text, fontWeight: '700', fontSize: 18 },

  trialCard: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  trialContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trialTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  trialDesc: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  coachBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    borderColor: colors.accent,
  },
  coachBannerTitle: {
    color: colors.muted,
    fontSize: 12,
  },
  coachBannerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, padding: 14 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 4 },

  weekCard: { marginBottom: space.lg, padding: 16 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  weekTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  weekCount: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  weekFooter: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  weekCopy: { color: colors.muted, fontSize: 13, flex: 1 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streak: { color: colors.accent, fontSize: 13, fontWeight: '700' },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: space.lg,
  },
  action: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  actionPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionPrimaryText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '700',
  },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '600' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  studentWorkoutsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  sectionCount: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
  },

  alertsCard: {
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    padding: 14,
  },
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  alertsCountBadge: {
    backgroundColor: colors.dangerDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  alertsCountText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  alertsSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 10,
  },
  alertsList: {
    gap: 8,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface2,
    padding: 10,
    borderRadius: radius.sm,
  },
  alertItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  alertItemName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  alertItemDesc: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  clientCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  clientAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarLetter: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
  },
  clientInfo: {
    flex: 1,
  },
  clientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  clientName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  riskBadge: {
    backgroundColor: colors.dangerDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  riskBadgeText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },
  warningBadge: {
    backgroundColor: 'rgba(235, 179, 58, 0.14)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  warningBadgeText: {
    color: '#EBB33A',
    fontSize: 11,
    fontWeight: '600',
  },
  goalBadge: {
    backgroundColor: colors.accentDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  goalBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  clientSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  clientSubText: {
    color: colors.muted,
    fontSize: 13,
  },
  clientWeightBadge: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  clientAction: {
    padding: 4,
  },

  workoutCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutText: { flex: 1, marginRight: 8 },
  workoutName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  workoutDescription: { color: colors.muted, fontSize: 13, marginTop: 4 },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyWorkoutsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    width: '100%',
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 290,
  },
  inviteButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  inviteButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  alertRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pingBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInCardWrap: {
    marginBottom: 12,
  },
  checkInCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  checkInRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkInIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  checkInSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  routineChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: 8,
  },
  routineChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

