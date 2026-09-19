import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '../store/useThemeStore';
import { useLanguage } from '../store/useLanguageStore';

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
  extra?: string;
}

interface LineChartProps {
  title?: string;
  unit?: string;
  data: ChartDataPoint[];
  color?: string;
  height?: number;
  emptyText?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  title,
  unit = 'kg',
  data,
  color,
  height = 200,
  emptyText,
}) => {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const resolvedEmptyText = emptyText || t('analytics.noChartData');
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const strokeColor = color || colors.accent;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  const chartGeometry = useMemo(() => {
    if (!data || data.length === 0 || containerWidth <= 0) {
      return null;
    }

    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 30;

    const plotWidth = containerWidth - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const values = data.map((d) => d.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);

    // Adiciona margem vertical para os pontos não tocarem no limite superior/inferior
    const margin = rawMax === rawMin ? 5 : (rawMax - rawMin) * 0.15;
    const minY = Math.max(0, Math.floor(rawMin - margin));
    const maxY = Math.ceil(rawMax + margin);
    const rangeY = maxY - minY || 1;

    const points = data.map((d, index) => {
      const x =
        data.length === 1
          ? paddingLeft + plotWidth / 2
          : paddingLeft + (index / (data.length - 1)) * plotWidth;
      const y = paddingTop + plotHeight - ((d.value - minY) / rangeY) * plotHeight;
      return { x, y, data: d, index };
    });

    // Construção do Path SVG da linha
    let pathD = '';
    points.forEach((pt, i) => {
      if (i === 0) {
        pathD += `M ${pt.x} ${pt.y}`;
      } else {
        // Interpolação suave (Bézier cúbico simples)
        const prev = points[i - 1];
        const cp1x = prev.x + (pt.x - prev.x) / 2;
        const cp1y = prev.y;
        const cp2x = prev.x + (pt.x - prev.x) / 2;
        const cp2y = pt.y;
        pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pt.x} ${pt.y}`;
      }
    });

    // Construção do Path da área sombreada
    const firstPt = points[0];
    const lastPt = points[points.length - 1];
    const baselineY = paddingTop + plotHeight;
    const areaD = `${pathD} L ${lastPt.x} ${baselineY} L ${firstPt.x} ${baselineY} Z`;

    // Linhas de grelha horizontal (mínimo, médio, máximo)
    const gridYValues = [minY, (minY + maxY) / 2, maxY];
    const gridLines = gridYValues.map((val) => ({
      val: Math.round(val * 10) / 10,
      y: paddingTop + plotHeight - ((val - minY) / rangeY) * plotHeight,
    }));

    return {
      points,
      pathD,
      areaD,
      gridLines,
      paddingLeft,
      paddingTop,
      plotWidth,
      plotHeight,
      minY,
      maxY,
    };
  }, [data, containerWidth, height]);

  // Ponto selecionado para detalhe
  const activePoint = useMemo(() => {
    if (!chartGeometry || selectedIndex === null) {
      if (chartGeometry && chartGeometry.points.length > 0) {
        return chartGeometry.points[chartGeometry.points.length - 1];
      }
      return null;
    }
    return chartGeometry.points[selectedIndex] || null;
  }, [chartGeometry, selectedIndex]);

  // Variação em relação ao primeiro ponto
  const deltaFromStart = useMemo(() => {
    if (!data || data.length < 2) return null;
    const first = data[0].value;
    const current = activePoint ? activePoint.data.value : data[data.length - 1].value;
    const diff = Math.round((current - first) * 10) / 10;
    return diff;
  }, [data, activePoint]);

  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
        <Text style={[styles.emptyText, { color: colors.muted }]}>{resolvedEmptyText}</Text>
      </View>
    );
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Cabeçalho com Título, Valor Ativo e Variação */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {title && (
            <Text style={[styles.title, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
          )}
          {activePoint && (
            <View style={styles.valueRow}>
              <Text style={[styles.activeValue, { color: colors.text }]}>
                {activePoint.data.value} {unit}
              </Text>
              {deltaFromStart !== null && (
                <View
                  style={[
                    styles.deltaBadge,
                    {
                      backgroundColor:
                        deltaFromStart > 0
                          ? 'rgba(16, 185, 129, 0.15)'
                          : deltaFromStart < 0
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(156, 163, 175, 0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.deltaText,
                      {
                        color:
                          deltaFromStart > 0
                            ? '#10B981'
                            : deltaFromStart < 0
                            ? '#EF4444'
                            : colors.muted,
                      },
                    ]}
                  >
                    {deltaFromStart > 0 ? `+${deltaFromStart}` : deltaFromStart} {unit}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {activePoint && (
          <View
            style={[
              styles.dateBadge,
              {
                backgroundColor: colors.surface2 || 'rgba(255, 255, 255, 0.05)',
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.dateText, { color: colors.text }]} numberOfLines={1}>
              {activePoint.data.date}
            </Text>
            {activePoint.data.extra && (
              <Text style={[styles.extraText, { color: strokeColor }]} numberOfLines={1}>
                {activePoint.data.extra}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Gráfico SVG */}
      {containerWidth > 0 && chartGeometry && (
        <View style={{ height }}>
          <Svg width={containerWidth} height={height}>
            <Defs>
              <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={strokeColor} stopOpacity="0.35" />
                <Stop offset="1" stopColor={strokeColor} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>

            {/* Linhas de grelha horizontais */}
            {chartGeometry.gridLines.map((line, idx) => (
              <React.Fragment key={idx}>
                <Line
                  x1={chartGeometry.paddingLeft}
                  y1={line.y}
                  x2={containerWidth - 20}
                  y2={line.y}
                  stroke={colors.border}
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <SvgText
                  x={chartGeometry.paddingLeft - 8}
                  y={line.y + 4}
                  fill={colors.muted}
                  fontSize="11"
                  textAnchor="end"
                >
                  {line.val}
                </SvgText>
              </React.Fragment>
            ))}

            {/* Área sombreada */}
            <Path d={chartGeometry.areaD} fill="url(#areaGradient)" />

            {/* Linha da curva */}
            <Path
              d={chartGeometry.pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Indicador vertical do ponto selecionado */}
            {activePoint && (
              <Line
                x1={activePoint.x}
                y1={chartGeometry.paddingTop}
                x2={activePoint.x}
                y2={chartGeometry.paddingTop + chartGeometry.plotHeight}
                stroke={colors.muted}
                strokeDasharray="3 3"
                strokeWidth="1"
                opacity={0.6}
              />
            )}

            {/* Pontos clicáveis */}
            {chartGeometry.points.map((pt) => {
              const isSelected = activePoint && activePoint.index === pt.index;
              return (
                <React.Fragment key={pt.index}>
                  {/* Círculo externo para toque */}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 7 : 4.5}
                    fill={isSelected ? strokeColor : colors.surface}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 2.5 : 2}
                  />
                  {/* Área invisível maior para facilitar o toque com o dedo */}
                  <Rect
                    x={pt.x - 18}
                    y={pt.y - 18}
                    width={36}
                    height={36}
                    fill="transparent"
                    onPress={() => setSelectedIndex(pt.index)}
                  />
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
      )}

      {/* Rótulos das datas no eixo horizontal inferior */}
      {data.length > 1 && (
        <View style={styles.xAxisRow}>
          <Text style={[styles.axisDate, { color: colors.muted }]}>{data[0].date}</Text>
          {data.length > 2 && (
            <Text style={[styles.axisDate, { color: colors.muted }]}>
              {data[Math.floor(data.length / 2)].date}
            </Text>
          )}
          <Text style={[styles.axisDate, { color: colors.muted }]}>
            {data[data.length - 1].date}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginVertical: 8,
    overflow: 'hidden',
  },
  emptyContainer: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
    width: '100%',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  activeValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  deltaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateBadge: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    maxWidth: '45%',
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  extraText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 35,
    marginTop: 6,
  },
  axisDate: {
    fontSize: 11,
    fontWeight: '500',
  },
});
