import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Save, LayoutDashboard, PlusCircle, Trash2, Calendar, Settings, Activity, AlertCircle, BarChart3, Clock, CheckCircle2 } from 'lucide-react';

// 1. INICIALIZACIÓN DE FIREBASE (Regla Mandatoria)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'dashboard-oee-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para Filtros del Dashboard
  const [filterStart, setFilterStart] = useState('2025-01');
  const [filterEnd, setFilterEnd] = useState('2026-12');
  const [filterEquipo, setFilterEquipo] = useState('Todos');

  // Estados del Formulario (Entrada de Datos según diagrama)
  const [formData, setFormData] = useState({
    mes: new Date().toISOString().slice(0, 7),
    equipo: 'Linea Principal A',
    parametro: 'Toneladas/Hr',
    tiempoTotal: 720,
    dtProgramado: 24,
    dtNoProgramado: 48,
    idleTime: 120,
    capacidadNominal: 10000,
    capacidadActual: 8200,
    produccionTotal: 8200,
    produccionMala: 150
  });

  // 2. AUTENTICACIÓN Y CONEXIÓN A BASE DE DATOS
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Error de autenticación:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Regla Mandatoria: Consulta simple sin orderBy para evitar errores de índices
    const kpiCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'kpi_mensual');
    
    const unsubscribe = onSnapshot(kpiCollectionRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Ordenamos en memoria
      data.sort((a, b) => a.mes.localeCompare(b.mes));
      setRecords(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching data:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. LÓGICA DE CÁLCULO (Motor de Fórmulas basado en diagrama)
  const calculateKPIs = (data) => {
    const tTotal = Number(data.tiempoTotal) || 0;
    const dtProg = Number(data.dtProgramado) || 0;
    const dtNoProg = Number(data.dtNoProgramado) || 0;
    const idle = Number(data.idleTime) || 0;
    
    const capNominal = Number(data.capacidadNominal) || 1;
    const capActual = Number(data.capacidadActual) || 0;
    
    const prodTotal = Number(data.produccionTotal) || 1;
    const prodMala = Number(data.produccionMala) || 0;

    // Fórmulas derivadas del diagrama
    const uptime = tTotal - dtProg - dtNoProg - idle;
    const tiempoOperativoPlaneado = tTotal - idle; // Utilizado para disponibilidad base

    const disponibilidad = tiempoOperativoPlaneado > 0 ? (uptime / tiempoOperativoPlaneado) : 0;
    const eficiencia = capActual / capNominal;
    const calidad = prodTotal > 0 ? ((prodTotal - prodMala) / prodTotal) : 0;
    const utilizacion = tTotal > 0 ? (tiempoOperativoPlaneado / tTotal) : 0;

    const oee = disponibilidad * eficiencia * calidad;
    const teep = oee * utilizacion;

    return {
      uptime,
      disponibilidad,
      eficiencia,
      calidad,
      utilizacion,
      oee,
      teep
    };
  };

  // 4. MANEJO DE EVENTOS
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;

    const kpis = calculateKPIs(formData);
    const dataToSave = {
      ...formData,
      ...kpis,
      createdAt: serverTimestamp()
    };

    try {
      const kpiCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'kpi_mensual');
      await addDoc(kpiCollectionRef, dataToSave);
      alert('Registro guardado exitosamente en la base de datos.');
      setActiveTab('dashboard'); // Redirigir al dashboard para ver el impacto
    } catch (error) {
      console.error("Error al guardar:", error);
      alert('Error al guardar el registro.');
    }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'kpi_mensual', id));
    } catch (error) {
      console.error("Error al eliminar:", error);
    }
  };

  // 5. LÓGICA DEL DASHBOARD (Filtrado y Agrupación en Memoria)
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const isDateValid = r.mes >= filterStart && r.mes <= filterEnd;
      const isEquipoValid = filterEquipo === 'Todos' || r.equipo === filterEquipo;
      return isDateValid && isEquipoValid;
    });
  }, [records, filterStart, filterEnd, filterEquipo]);

  const dashboardStats = useMemo(() => {
    if (filteredRecords.length === 0) return null;
    
    const count = filteredRecords.length;
    const sum = filteredRecords.reduce((acc, curr) => ({
      oee: acc.oee + curr.oee,
      teep: acc.teep + curr.teep,
      disp: acc.disp + curr.disponibilidad,
      efic: acc.efic + curr.eficiencia,
      cal: acc.cal + curr.calidad,
      util: acc.util + curr.utilizacion
    }), { oee: 0, teep: 0, disp: 0, efic: 0, cal: 0, util: 0 });

    return {
      oee: (sum.oee / count) * 100,
      teep: (sum.teep / count) * 100,
      disp: (sum.disp / count) * 100,
      efic: (sum.efic / count) * 100,
      cal: (sum.cal / count) * 100,
      util: (sum.util / count) * 100
    };
  }, [filteredRecords]);

  // Preparar datos para gráfica de tendencia
  const chartData = filteredRecords.map(r => ({
    mes: r.mes,
    OEE: Number((r.oee * 100).toFixed(1)),
    TEEP: Number((r.teep * 100).toFixed(1)),
    Disponibilidad: Number((r.disponibilidad * 100).toFixed(1))
  }));

  const equiposDisponibles = ['Todos', ...new Set(records.map(r => r.equipo))];
  const currentKPIs = calculateKPIs(formData);

  // 6. RENDERIZADO DE COMPONENTES DE INTERFAZ
  const renderKPIFormat = (val) => `${(val * 100).toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header Corporativo */}
      <header className="bg-slate-900 text-white p-4 shadow-md border-b-4 border-blue-500">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold tracking-wide">Enterprise Reliability CMMS</h1>
              <p className="text-xs text-slate-400">Database KPI Tracker & Dashboard</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('registro')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'registro' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <PlusCircle className="w-4 h-4" /> Registrar Mes
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'dashboard' ? (
          /* --- VISTA: DASHBOARD --- */
          <div className="space-y-6 animate-in fade-in duration-500">
            
            {/* Filtros */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-6 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> Desde</label>
                <input type="month" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="border-slate-300 rounded-md border p-2 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> Hasta</label>
                <input type="month" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="border-slate-300 rounded-md border p-2 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Settings className="w-3 h-3"/> Equipo</label>
                <select value={filterEquipo} onChange={e => setFilterEquipo(e.target.value)} className="border-slate-300 rounded-md border p-2 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[200px]">
                  {equiposDisponibles.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
            ) : filteredRecords.length === 0 ? (
              <div className="bg-white p-10 text-center rounded-xl border border-slate-200 shadow-sm text-slate-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300"/>
                <h3 className="text-lg font-medium text-slate-700">No hay datos para esta consulta</h3>
                <p>Ajusta el rango de fechas o registra nuevos datos.</p>
              </div>
            ) : (
              <>
                {/* Tarjetas KPI Snapshot */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { title: 'OEE Promedio', value: dashboardStats?.oee, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { title: 'TEEP Promedio', value: dashboardStats?.teep, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { title: 'Disponibilidad', value: dashboardStats?.disp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { title: 'Eficiencia', value: dashboardStats?.efic, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { title: 'Calidad', value: dashboardStats?.cal, color: 'text-rose-600', bg: 'bg-rose-50' },
                    { title: 'Utilización', value: dashboardStats?.util, color: 'text-amber-600', bg: 'bg-amber-50' },
                  ].map((kpi, idx) => (
                    <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{kpi.title}</span>
                      <span className={`text-2xl font-bold ${kpi.color}`}>{kpi.value?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>

                {/* Gráfico Principal */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-500"/> Tendencia de Confiabilidad del Proceso</h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorOee" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorTeep" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dx={-10} unit="%" />
                        <Tooltip 
                          contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                          itemStyle={{fontWeight: 'bold'}}
                        />
                        <Legend wrapperStyle={{paddingTop: '20px'}}/>
                        <Area type="monotone" dataKey="Disponibilidad" stroke="#6366f1" strokeWidth={2} fill="none" />
                        <Area type="monotone" dataKey="OEE" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorOee)" />
                        <Area type="monotone" dataKey="TEEP" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTeep)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tabla de Registros */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-800 text-sm">Historial de Registros en Base de Datos</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                        <tr>
                          <th className="px-6 py-3 font-semibold">Mes</th>
                          <th className="px-6 py-3 font-semibold">Equipo</th>
                          <th className="px-6 py-3 font-semibold text-right">Disp.</th>
                          <th className="px-6 py-3 font-semibold text-right">Efic.</th>
                          <th className="px-6 py-3 font-semibold text-right">Calidad</th>
                          <th className="px-6 py-3 font-semibold text-right text-emerald-600">OEE</th>
                          <th className="px-6 py-3 font-semibold text-right text-blue-600">TEEP</th>
                          <th className="px-6 py-3 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredRecords.map(record => (
                          <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900">{record.mes}</td>
                            <td className="px-6 py-4 text-slate-600">{record.equipo}</td>
                            <td className="px-6 py-4 text-right">{(record.disponibilidad*100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-right">{(record.eficiencia*100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-right">{(record.calidad*100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-right font-bold text-emerald-600">{(record.oee*100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-right font-bold text-blue-600">{(record.teep*100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => handleDelete(record.id)} className="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar registro">
                                <Trash2 className="w-4 h-4 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* --- VISTA: INGRESO DE DATOS --- */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            
            {/* Formulario (Mapeo del Diagrama) */}
            <div className="lg:col-span-2 space-y-6">
              <form onSubmit={handleSave} className="space-y-6">
                
                {/* Info General */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Información del Periodo</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Mes de Registro</label>
                      <input type="month" name="mes" value={formData.mes} onChange={handleInputChange} required className="w-full border-slate-300 rounded-md border p-2 focus:ring-blue-500 focus:border-blue-500 outline-none"/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Equipo Observado</label>
                      <input type="text" name="equipo" value={formData.equipo} onChange={handleInputChange} required className="w-full border-slate-300 rounded-md border p-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Ej. Extrusora 1"/>
                    </div>
                  </div>
                </div>

                {/* BLOQUE 1: TIEMPOS (Disponibilidad y Utilización) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-indigo-500 border-y-slate-200 border-r-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-indigo-900 flex items-center gap-2"><Clock className="w-5 h-5"/> Entradas de Tiempo (Horas)</h3>
                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-semibold">Impacta Disponibilidad y Utilización</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1" title="Tiempo calendario total">Tiempo Total</label>
                      <input type="number" name="tiempoTotal" value={formData.tiempoTotal} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Downtime Prog.</label>
                      <input type="number" name="dtProgramado" value={formData.dtProgramado} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Downtime No Prog.</label>
                      <input type="number" name="dtNoProgramado" value={formData.dtNoProgramado} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1" title="Standby/Falta de demanda">Idle Time</label>
                      <input type="number" name="idleTime" value={formData.idleTime} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                  </div>
                  <div className="mt-3 bg-indigo-50 p-3 rounded-lg flex justify-between items-center text-sm">
                    <span className="text-indigo-800 font-medium">Uptime Calculado (Automático):</span>
                    <span className="font-bold text-indigo-900 text-lg">{currentKPIs.uptime.toFixed(1)} Hrs</span>
                  </div>
                </div>

                {/* BLOQUE 2: RENDIMIENTO / EFICIENCIA */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-purple-500 border-y-slate-200 border-r-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2"><Activity className="w-5 h-5"/> Entradas de Rendimiento</h3>
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded font-semibold">Impacta Eficiencia</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Parámetro (Unidad)</label>
                      <input type="text" name="parametro" value={formData.parametro} onChange={handleInputChange} className="w-full border-slate-300 rounded-md border p-2 text-sm" required/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Capacidad Nominal</label>
                      <input type="number" name="capacidadNominal" value={formData.capacidadNominal} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Capacidad Actual</label>
                      <input type="number" name="capacidadActual" value={formData.capacidadActual} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                  </div>
                </div>

                {/* BLOQUE 3: CALIDAD */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-rose-500 border-y-slate-200 border-r-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-rose-900 flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> Entradas de Calidad</h3>
                    <span className="text-xs bg-rose-100 text-rose-800 px-2 py-1 rounded font-semibold">Impacta Calidad</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Producción Total</label>
                      <input type="number" name="produccionTotal" value={formData.produccionTotal} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Prod. Fuera de Especificación</label>
                      <input type="number" name="produccionMala" value={formData.produccionMala} onChange={handleInputChange} className="w-full bg-slate-50 border-slate-300 rounded-md border p-2 text-right" required/>
                    </div>
                  </div>
                </div>

                {/* Botón de Guardar */}
                <div className="flex justify-end pt-4">
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold text-lg shadow-md transition-all flex items-center gap-2">
                    <Save className="w-5 h-5" /> Guardar Registro en Base de Datos
                  </button>
                </div>
              </form>
            </div>

            {/* Vista Previa de KPIs (Lateral) */}
            <div className="space-y-4">
              <div className="bg-slate-800 p-6 rounded-xl shadow-lg text-white sticky top-6 border border-slate-700">
                <h3 className="text-xl font-bold mb-6 pb-2 border-b border-slate-600 flex items-center justify-between">
                  Indicadores KPIs
                  <span className="text-xs font-normal text-slate-400">Pre-cálculo en vivo</span>
                </h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Disponibilidad</span>
                    <span className="text-xl font-bold">{renderKPIFormat(currentKPIs.disponibilidad)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Eficiencia</span>
                    <span className="text-xl font-bold">{renderKPIFormat(currentKPIs.eficiencia)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Calidad</span>
                    <span className="text-xl font-bold">{renderKPIFormat(currentKPIs.calidad)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-600/50">
                    <span className="text-slate-300">Utilización</span>
                    <span className="text-xl font-bold text-amber-400">{renderKPIFormat(currentKPIs.utilizacion)}</span>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-slate-600">
                    <div className="bg-emerald-500/20 border border-emerald-500/50 p-4 rounded-lg mb-3">
                      <div className="text-emerald-100 text-sm font-medium mb-1">OEE Global</div>
                      <div className="text-3xl font-black text-emerald-400">{renderKPIFormat(currentKPIs.oee)}</div>
                    </div>
                    
                    <div className="bg-blue-500/20 border border-blue-500/50 p-4 rounded-lg">
                      <div className="text-blue-100 text-sm font-medium mb-1">TEEP</div>
                      <div className="text-3xl font-black text-blue-400">{renderKPIFormat(currentKPIs.teep)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        )}
      </main>
    </div>
  );
}