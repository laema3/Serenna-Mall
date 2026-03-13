import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, 
  Wallet, 
  TrendingDown, 
  Receipt, 
  Plus, 
  Trash2, 
  Calendar, 
  FileText, 
  User, 
  DollarSign,
  AlertCircle,
  Edit2,
  X,
  Menu,
  Check,
  Filter,
  Lock,
  LogOut,
  Download,
  FileSpreadsheet,
  File as FileIcon,
  LayoutDashboard,
  Truck,
  Users,
  PlusCircle,
  BarChart3,
  Bookmark,
  Save,
  Play
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  onSnapshot, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs,
  query,
  where,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { db, auth } from './firebase';

// Error Handling Spec for Firestore Permissions
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  let errorMessage = error instanceof Error ? error.message : String(error);
  
  // Traduzir erros comuns do Firestore
  if (errorMessage.includes('Missing or insufficient permissions')) {
    errorMessage = 'Permissão insuficiente para realizar esta operação.';
  } else if (errorMessage.includes('Quota exceeded')) {
    errorMessage = 'Cota do banco de dados excedida. Por favor, tente novamente amanhã.';
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      try {
        if (this.state.error) {
          errorMessage = this.state.error.message || String(this.state.error);
          // Try to parse if it's our custom JSON error
          if (typeof errorMessage === 'string' && errorMessage.startsWith('{')) {
            try {
              const parsed = JSON.parse(errorMessage);
              if (parsed && parsed.error) {
                errorMessage = `Erro de permissão: ${parsed.error}`;
              }
            } catch (e) {
              // Not valid JSON or not our format, keep original
            }
          }
        }
      } catch (e) {
        console.error("Error in ErrorBoundary render:", e);
      }

      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-red-200 text-center">
            <AlertCircle size={48} className="text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-900 mb-2">Ops! Algo deu errado</h2>
            <p className="text-red-700 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-all"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Expense = {
  id: string;
  date: string;
  dueDate: string;
  invoiceNumber: string;
  supplier: string;
  amount: number;
  installment?: string; // e.g., "1/3"
  status: 'pending' | 'paid';
};

type Supplier = {
  id: string;
  name: string;
  contact: string;
  email: string;
  category: string;
};

type Client = {
  id: string;
  name: string;
  contact: string;
  email: string;
  project: string;
};

type CostCenter = {
  id: string;
  name: string;
  budget: number;
};

type SavedReport = {
  id: string;
  name: string;
  filterStart: string;
  filterEnd: string;
  filterSupplier: string;
  filterStatus: 'all' | 'pending' | 'paid';
};

type AppUser = {
  id: string;
  username: string;
  role: 'admin' | 'standard';
};

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  
  const [initialBalance, setInitialBalance] = useState<number>(10000000);
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState(initialBalance.toString());
  const [balancePassword, setBalancePassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [currentView, setCurrentView] = useState('dashboard');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  const [newExpense, setNewExpense] = useState<Partial<Expense> & { installments?: number }>({
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    invoiceNumber: '',
    supplier: '',
    amount: 0,
    installments: 1,
  });

  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({
    name: '',
    contact: '',
    email: '',
    category: '',
  });

  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: '',
    contact: '',
    email: '',
    project: '',
  });

  const [newCostCenter, setNewCostCenter] = useState<Partial<CostCenter>>({
    name: '',
    budget: 0,
  });

  const [newUserForm, setNewUserForm] = useState<Partial<AppUser & { password?: string }>>({
    username: '',
    password: '',
    role: 'standard',
  });

  console.log("MainApp render - user:", user?.username, "isLoading:", isLoading, "isAuthReady:", isAuthReady);

  const [newSavedReportName, setNewSavedReportName] = useState('');

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed - firebaseUser:", firebaseUser?.email || "none");
      if (firebaseUser) {
        // Check if user exists in Firestore users collection
        try {
          let userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          // Se o documento não existe no UID do Auth, mas o email é do nosso sistema de login manual
          if (!userDoc.exists() && firebaseUser.email?.endsWith('@serenna.mall')) {
            const docId = firebaseUser.email.split('@')[0];
            const oldDoc = await getDoc(doc(db, 'users', docId));
            
            if (oldDoc.exists()) {
              const userData = oldDoc.data();
              // Migra o documento antigo para o novo UID do Auth
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                ...userData,
                id: firebaseUser.uid
              });
              try {
                await deleteDoc(doc(db, 'users', docId));
              } catch (e) {
                console.warn('Could not delete old user doc, probably due to permissions. This is fine.', e);
              }
              userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            }
          }

          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUser({
              id: firebaseUser.uid,
              username: userData.username || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              role: userData.role || 'standard'
            });
          } else {
            // New user from Google or other provider
            const newUser: AppUser = {
              id: firebaseUser.uid,
              username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              role: firebaseUser.email === 'camillasites@gmail.com' ? 'admin' : 'standard'
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              username: newUser.username,
              role: newUser.role
            });
            setUser(newUser);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          // Fallback if firestore fails but auth works
          setUser({
            id: firebaseUser.uid,
            username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            role: firebaseUser.email === 'camillasites@gmail.com' ? 'admin' : 'standard'
          });
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Data Listeners
  useEffect(() => {
    if (!isAuthReady || !user) {
      if (isAuthReady && !user) setIsLoading(false);
      return;
    }

    const unsubSettings = onSnapshot(doc(db, 'settings', 'initialBalance'), (snapshot: any) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const val = data?.value;
        setInitialBalance(typeof val === 'number' ? val : parseFloat(val) || 0);
      } else if (user?.role === 'admin') {
        setDoc(snapshot.ref, { key: 'initialBalance', value: '10000000' }).catch(e => console.warn('Could not set initial balance', e));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/initialBalance'));

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      const exps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(exps);
      setIsLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'expenses'));

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
      setSuppliers(supps);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'));

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const cls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(cls);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'clients'));

    const unsubCostCenters = onSnapshot(collection(db, 'cost_centers'), (snapshot) => {
      const ccs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CostCenter));
      setCostCenters(ccs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cost_centers'));

    const unsubReports = onSnapshot(collection(db, 'saved_reports'), (snapshot) => {
      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedReport));
      setSavedReports(reports);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'saved_reports'));

    let unsubAllUsers: () => void;
    if (user.role === 'admin') {
      unsubAllUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
        setAllUsers(users);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    }

    return () => {
      unsubSettings();
      unsubExpenses();
      unsubSuppliers();
      unsubClients();
      unsubCostCenters();
      unsubReports();
      if (unsubAllUsers) unsubAllUsers();
    };
  }, [isAuthReady, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const q = query(collection(db, 'users'), where('username', '==', loginForm.username));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setLoginError('Usuário não encontrado');
        return;
      }

      // Procura o documento que tem a senha correta (ignora documentos duplicados sem senha)
      const userDoc = querySnapshot.docs.find(doc => doc.data().password === loginForm.password);
      
      if (!userDoc) {
        setLoginError('Senha incorreta');
        return;
      }

      const userData = userDoc.data();
      const dummyEmail = `${userDoc.id}@serenna.mall`;
      
      try {
        await signInWithEmailAndPassword(auth, dummyEmail, loginForm.password);
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
          try {
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            await createUserWithEmailAndPassword(auth, dummyEmail, loginForm.password);
          } catch (createErr: any) {
            setLoginError('Erro ao criar conta de acesso: ' + createErr.message);
          }
        } else {
          setLoginError('Erro na autenticação: ' + authErr.message);
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setLoginError('Erro ao conectar com o banco de dados');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError('Erro: Domínio não autorizado no Firebase. Por favor, adicione este domínio nas configurações de Autenticação do Console do Firebase.');
      } else {
        setLoginError('Erro ao entrar com Google: ' + error.message);
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    if (loginForm.password.length < 4) {
      setLoginError('A senha deve ter pelo menos 4 caracteres');
      return;
    }

    try {
      // Check if username already exists
      const q = query(collection(db, 'users'), where('username', '==', loginForm.username));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setLoginError('Este nome de usuário já está em uso');
        return;
      }

      // If no users exist in the database, make this one admin. Otherwise standard.
      const allUsersSnapshot = await getDocs(collection(db, 'users'));
      const role = allUsersSnapshot.empty ? 'admin' : 'standard';
      
      const dummyEmail = `${loginForm.username}@serenna.mall`;
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      const userCredential = await createUserWithEmailAndPassword(auth, dummyEmail, loginForm.password);
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: loginForm.username,
        password: loginForm.password,
        role: role
      });

      setIsRegistering(false);
      alert('Conta criada com sucesso! Você já está logado.');
    } catch (err: any) {
      console.error('Registration error:', err);
      let message = 'Erro ao criar conta: ' + err.message;
      if (err.code === 'auth/email-already-in-use') {
        message = 'Este nome de usuário já está em uso. Tente outro ou faça login.';
      } else if (err.code === 'auth/weak-password') {
        message = 'A senha é muito fraca.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Nome de usuário inválido.';
      }
      setLoginError(message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const exportToExcel = () => {
    const dataToExport = filteredExpenses.map(exp => ({
      'Data': formatDate(exp.date),
      'Fornecedor': exp.supplier,
      'Parcela': exp.installment || 'Única',
      'Nota/Fatura': exp.invoiceNumber,
      'Vencimento': formatDate(exp.dueDate),
      'Valor (R$)': exp.amount,
      'Status': exp.status === 'paid' ? 'Pago' : 'Pendente'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    
    // Add summary info
    const totalPaid = filteredExpenses.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
    const totalPending = filteredExpenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);

    XLSX.utils.sheet_add_aoa(ws, [
      ["Resumo do Relatório:"],
      ["Total Pago:", totalPaid],
      ["Total Pendente:", totalPending],
      ["Total Geral:", filteredTotalExpenses],
      [],
      ["Filtros Aplicados:"],
      [filterStart ? `Início: ${formatDate(filterStart)}` : "", filterEnd ? `Fim: ${formatDate(filterEnd)}` : "", filterSupplier ? `Fornecedor: ${filterSupplier}` : "", filterStatus !== 'all' ? `Status: ${filterStatus === 'paid' ? 'Pago' : 'Pendente'}` : ""]
    ], { origin: "I1" });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos");
    XLSX.writeFile(wb, `Relatorio_Gastos_Serenna_Mall_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text("Relatório de Gastos - SERENNA MALL", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);
    doc.text(`Saldo Inicial: ${formatCurrency(initialBalance)}`, 14, 28);
    doc.text(`Total de Gastos (Geral): ${formatCurrency(totalExpenses)}`, 14, 34);
    doc.text(`Saldo Atual: ${formatCurrency(currentBalance)}`, 14, 40);

    const totalPaid = filteredExpenses.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
    const totalPending = filteredExpenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);

    doc.setFontSize(9);
    doc.text(`Resumo do Período:`, 140, 22);
    doc.text(`Total Pago: ${formatCurrency(totalPaid)}`, 140, 28);
    doc.text(`Total Pendente: ${formatCurrency(totalPending)}`, 140, 34);
    doc.text(`Total Filtrado: ${formatCurrency(filteredTotalExpenses)}`, 140, 40);

    let startY = 48;
    if (filterStart || filterEnd || filterSupplier || filterStatus !== 'all') {
      let filterText = "Filtros: ";
      if (filterStart) filterText += `De ${formatDate(filterStart)} `;
      if (filterEnd) filterText += `Até ${formatDate(filterEnd)} `;
      if (filterSupplier) filterText += `Fornecedor: ${filterSupplier} `;
      if (filterStatus !== 'all') filterText += `Status: ${filterStatus === 'paid' ? 'Pago' : 'Pendente'}`;
      
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(filterText, 14, 46);
      doc.setTextColor(0);
      startY = 52;
    }

    const tableData = filteredExpenses.map(exp => [
      formatDate(exp.date),
      exp.supplier + (exp.installment ? ` (P. ${exp.installment})` : ''),
      exp.invoiceNumber,
      formatDate(exp.dueDate),
      exp.status === 'paid' ? 'PAGO' : 'PENDENTE',
      formatCurrency(exp.amount)
    ]);

    autoTable(doc, {
      startY: startY,
      head: [['Data', 'Fornecedor', 'Nota/Fatura', 'Vencimento', 'Status', 'Valor']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [20, 20, 20] },
      columnStyles: {
        4: { fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.column.index === 4 && data.cell.section === 'body') {
          if (data.cell.text[0] === 'PAGO') {
            data.cell.styles.textColor = [0, 128, 0];
          } else {
            data.cell.styles.textColor = [128, 0, 0];
          }
        }
      },
      foot: [['', '', '', '', 'TOTAL NO PERÍODO', formatCurrency(filteredTotalExpenses)]],
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`Relatorio_Gastos_Serenna_Mall_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Filters
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid'>('all');

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Expense>>({});
  
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editSupplierForm, setEditSupplierForm] = useState<Partial<Supplier>>({});

  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editClientForm, setEditClientForm] = useState<Partial<Client>>({});

  const [editingCostCenterId, setEditingCostCenterId] = useState<string | null>(null);
  const [editCostCenterForm, setEditCostCenterForm] = useState<Partial<CostCenter>>({});

  // Delete Modal State
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: '', type: 'expense' as 'expense' | 'supplier' | 'client' | 'costCenter' | 'savedReport' | 'user', error: '' });
  const [quickSupplierModal, setQuickSupplierModal] = useState({ isOpen: false, name: '', contact: '', email: '', category: '' });

  const quickAddSupplier = async () => {
    try {
      const docRef = await addDoc(collection(db, 'suppliers'), quickSupplierModal);
      const newSupp = { ...quickSupplierModal, id: docRef.id } as Supplier;
      if (editingId) {
        setEditForm({ ...editForm, supplier: newSupp.name });
      } else {
        setNewExpense({ ...newExpense, supplier: newSupp.name });
      }
      setQuickSupplierModal({ isOpen: false, name: '', contact: '', email: '', category: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'suppliers');
    }
  };

  const handleQuickAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    quickAddSupplier();
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      if (filterStart && exp.date < filterStart) return false;
      if (filterEnd && exp.date > filterEnd) return false;
      if (filterSupplier && !exp.supplier.toLowerCase().includes(filterSupplier.toLowerCase())) return false;
      if (filterStatus !== 'all' && exp.status !== filterStatus) return false;
      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.dueDate || a.date).getTime();
      const dateB = new Date(b.dueDate || b.date).getTime();
      return dateA - dateB;
    });
  }, [expenses, filterStart, filterEnd, filterSupplier, filterStatus]);

  const totalExpenses = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const currentBalance = (Number(initialBalance) || 0) - totalExpenses;

  const filteredTotalExpenses = filteredExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

  // Prepare chart data based on filtered expenses
  const chartData = useMemo(() => {
    let balanceAtStart = initialBalance;
    
    if (filterStart) {
      const expensesBeforeStart = expenses
        .filter(exp => exp.date < filterStart)
        .reduce((sum, exp) => sum + exp.amount, 0);
      balanceAtStart -= expensesBeforeStart;
    }

    let runningBalance = balanceAtStart;
    const data = [{
      date: filterStart ? formatDate(filterStart) : 'Início',
      balance: balanceAtStart,
      expense: 0
    }];

    const groupedByDate = filteredExpenses.reduce((acc, exp) => {
      if (!acc[exp.date]) acc[exp.date] = 0;
      acc[exp.date] += exp.amount;
      return acc;
    }, {} as Record<string, number>);

    const sortedDates = Object.keys(groupedByDate).sort();

    sortedDates.forEach(date => {
      runningBalance -= groupedByDate[date];
      data.push({
        date: formatDate(date),
        balance: runningBalance,
        expense: groupedByDate[date]
      });
    });

    return data;
  }, [filteredExpenses, expenses, initialBalance, filterStart]);

  const handleSaveBalance = async () => {
    // Handle Brazilian format (replace comma with dot and remove thousands separator)
    const sanitizedBalance = tempBalance.replace(/\./g, '').replace(',', '.');
    const newBalance = parseFloat(sanitizedBalance);
    
    if (isNaN(newBalance)) {
      alert('Por favor, insira um valor válido.');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'initialBalance'), { key: 'initialBalance', value: newBalance.toString() });
      setInitialBalance(newBalance);
      setIsEditingBalance(false);
      setBalancePassword('');
      alert('Saldo inicial atualizado com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/initialBalance');
    }
  };

  const toggleStatus = async (expense: Expense) => {
    const newStatus = expense.status === 'paid' ? 'pending' : 'paid';
    try {
      await updateDoc(doc(db, 'expenses', expense.id), { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `expenses/${expense.id}`);
    }
  };

  const handleToggleStatus = (expense: Expense) => {
    toggleStatus(expense);
  };

  const handleStartEdit = (expense: Expense) => {
    startEdit(expense);
  };

  const handleConfirmDelete = (id: string) => {
    confirmDelete(id, 'expense');
  };

  const addExpense = async () => {
    const newExpenses = [];
    const count = newExpense.installments || 1;
    
    for (let i = 0; i < count; i++) {
      const expDate = new Date(newExpense.date!);
      expDate.setMonth(expDate.getMonth() + i);
      
      let expDueDate = newExpense.dueDate;
      if (newExpense.dueDate) {
        const dDate = new Date(newExpense.dueDate);
        dDate.setMonth(dDate.getMonth() + i);
        expDueDate = dDate.toISOString().split('T')[0];
      }

      newExpenses.push({
        id: Math.random().toString(36).substr(2, 9),
        date: expDate.toISOString().split('T')[0],
        dueDate: expDueDate,
        invoiceNumber: count > 1 ? `${newExpense.invoiceNumber} (${i + 1}/${count})` : newExpense.invoiceNumber,
        supplier: newExpense.supplier,
        amount: newExpense.amount,
        installment: count > 1 ? `${i + 1}/${count}` : undefined,
        status: 'pending'
      });
    }

    try {
      const batch = writeBatch(db);
      newExpenses.forEach(exp => {
        const docRef = doc(collection(db, 'expenses'));
        batch.set(docRef, exp);
      });
      await batch.commit();
      
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        dueDate: '',
        invoiceNumber: '',
        supplier: '',
        amount: 0,
        installments: 1,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'expenses');
    }
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.amount || !newExpense.supplier || !newExpense.date) return;
    addExpense();
  };

  const startEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setEditForm(expense);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    console.log('Saving edit:', editForm);
    try {
      await updateDoc(doc(db, 'expenses', editingId), editForm);
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `expenses/${editingId}`);
    }
  };

  const confirmDelete = (id: string, type: 'expense' | 'supplier' | 'client' | 'costCenter' | 'savedReport' | 'user' = 'expense') => {
    setDeleteModal({ ...deleteModal, isOpen: true, id, type, error: '' });
  };

  const executeDelete = async () => {
    if (deleteModal.type === 'supplier') {
      const supplier = suppliers.find(s => s.id === deleteModal.id);
      const hasExpenses = expenses.some(exp => exp.supplier === supplier?.name);
      if (hasExpenses) {
        setDeleteModal({ ...deleteModal, error: 'Não é possível excluir: este fornecedor possui lançamentos vinculados.' });
        return;
      }
    }

    try {
      const path = deleteModal.type === 'expense' ? 'expenses' : 
                   deleteModal.type === 'supplier' ? 'suppliers' : 
                   deleteModal.type === 'client' ? 'clients' :
                   deleteModal.type === 'costCenter' ? 'cost_centers' :
                   deleteModal.type === 'user' ? 'users' :
                   'saved_reports';
      
      await deleteDoc(doc(db, path, deleteModal.id));
      setDeleteModal({ isOpen: false, id: '', type: 'expense', error: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${deleteModal.type}/${deleteModal.id}`);
    }
  };

  const addCostCenter = async () => {
    try {
      await addDoc(collection(db, 'cost_centers'), newCostCenter);
      setNewCostCenter({ name: '', budget: 0 });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'cost_centers');
    }
  };

  const handleAddCostCenter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCostCenter.name) return;
    addCostCenter();
  };

  const startEditCostCenter = (cc: CostCenter) => {
    setEditingCostCenterId(cc.id);
    setEditCostCenterForm(cc);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartEditCostCenter = (cc: CostCenter) => {
    startEditCostCenter(cc);
  };

  const saveEditCostCenter = async () => {
    if (!editingCostCenterId) return;
    try {
      await updateDoc(doc(db, 'cost_centers', editingCostCenterId), editCostCenterForm);
      setEditingCostCenterId(null);
      setEditCostCenterForm({});
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `cost_centers/${editingCostCenterId}`);
    }
  };

  const saveReportTemplate = async () => {
    const reportData = {
      name: newSavedReportName,
      filterStart,
      filterEnd,
      filterSupplier,
      filterStatus
    };
    try {
      await addDoc(collection(db, 'saved_reports'), reportData);
      setNewSavedReportName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'saved_reports');
    }
  };

  const handleSaveReportTemplate = () => {
    if (!newSavedReportName) return;
    saveReportTemplate();
  };

  const addSupplier = async () => {
    try {
      await addDoc(collection(db, 'suppliers'), newSupplier);
      setNewSupplier({ name: '', contact: '', email: '', category: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'suppliers');
    }
  };

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name) return;
    addSupplier();
  };

  const startEditSupplier = (s: Supplier) => {
    setEditingSupplierId(s.id);
    setEditSupplierForm(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartEditSupplier = (s: Supplier) => {
    startEditSupplier(s);
  };

  const saveEditSupplier = async () => {
    if (!editingSupplierId) return;
    try {
      await updateDoc(doc(db, 'suppliers', editingSupplierId), editSupplierForm);
      setEditingSupplierId(null);
      setEditSupplierForm({});
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `suppliers/${editingSupplierId}`);
    }
  };

  const addClient = async () => {
    try {
      await addDoc(collection(db, 'clients'), newClient);
      setNewClient({ name: '', contact: '', email: '', project: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'clients');
    }
  };

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name) return;
    addClient();
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.username || !newUserForm.password) return;
    try {
      // We use a random ID for Firestore, but the username is unique
      await addDoc(collection(db, 'users'), {
        username: newUserForm.username,
        password: newUserForm.password,
        role: newUserForm.role || 'standard'
      });
      setNewUserForm({ username: '', password: '', role: 'standard' });
      alert('Usuário cadastrado com sucesso! Ele poderá acessar o sistema com o usuário e senha informados.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    }
  };

  const startEditClient = (c: Client) => {
    setEditingClientId(c.id);
    setEditClientForm(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartEditClient = (c: Client) => {
    startEditClient(c);
  };

  const saveEditClient = async () => {
    if (!editingClientId) return;
    try {
      await updateDoc(doc(db, 'clients', editingClientId), editClientForm);
      setEditingClientId(null);
      setEditClientForm({});
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `clients/${editingClientId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-900 mx-auto"></div>
          <p className="text-neutral-600 font-medium">Carregando dados da obra...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-neutral-200">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-neutral-900 text-white rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-4">
              <Building2 size={40} />
            </div>
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">SERENNA MALL</h1>
            <p className="text-neutral-500 font-medium">Controle de Gastos</p>
            <h2 className="text-xl font-bold text-neutral-800 mt-4">
              {isRegistering ? 'Criar Nova Conta' : 'Entrar no Sistema'}
            </h2>
          </div>

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Usuário</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                  <User size={18} />
                </div>
                <input 
                  type="text" 
                  required
                  value={loginForm.username}
                  onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                  className="w-full pl-11 pr-4 py-3 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 transition-all outline-none"
                  placeholder="Seu usuário"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                  <Lock size={18} />
                </div>
                <input 
                  type="password" 
                  required
                  value={loginForm.password}
                  onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                  className="w-full pl-11 pr-4 py-3 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 transition-all outline-none"
                  placeholder={isRegistering ? "Mínimo 4 caracteres" : "Sua senha"}
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-100">
                <AlertCircle size={16} />
                {loginError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-neutral-900 text-white font-bold py-3.5 rounded-xl hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200"
            >
              {isRegistering ? 'Cadastrar e Entrar' : 'Entrar no Sistema'}
            </button>

            <button 
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setLoginError('');
              }}
              className="w-full text-neutral-600 font-semibold text-sm hover:underline"
            >
              {isRegistering ? 'Já tenho uma conta? Entrar' : 'Não tem conta? Criar agora'}
            </button>

            {!isRegistering && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-neutral-500 font-bold">Ou</span>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full bg-white border border-neutral-300 text-neutral-700 font-bold py-3.5 rounded-xl hover:bg-neutral-50 transition-all flex items-center justify-center gap-3 shadow-sm"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                  Entrar com Google
                </button>
              </>
            )}
          </form>
          
          <p className="text-center text-neutral-400 text-xs mt-8 uppercase tracking-widest font-semibold">
            Sistema de Gestão de Obras
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans flex">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-neutral-900 text-white flex-shrink-0 flex flex-col transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:flex
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white text-neutral-900 rounded-lg flex items-center justify-center shadow-lg">
              <Building2 size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SERENNA MALL</h1>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Controle de Gastos</p>
            </div>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden text-neutral-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button 
            onClick={() => { setCurrentView('dashboard'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'dashboard' ? 'bg-white text-neutral-900 shadow-lg' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-semibold">Painel</span>
          </button>
          
          <button 
            onClick={() => { setCurrentView('suppliers'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'suppliers' ? 'bg-white text-neutral-900 shadow-lg' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          >
            <Truck size={20} />
            <span className="font-semibold">Fornecedores</span>
          </button>

          <button 
            onClick={() => { setCurrentView('clients'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'clients' ? 'bg-white text-neutral-900 shadow-lg' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          >
            <Users size={20} />
            <span className="font-semibold">Clientes</span>
          </button>

          <button 
            onClick={() => { setCurrentView('expenses'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'expenses' ? 'bg-white text-neutral-900 shadow-lg' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          >
            <PlusCircle size={20} />
            <span className="font-semibold">Lançamentos</span>
          </button>

          <button 
            onClick={() => { setCurrentView('reports'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'reports' ? 'bg-white text-neutral-900 shadow-lg' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
          >
            <BarChart3 size={20} />
            <span className="font-semibold">Relatórios</span>
          </button>

          {user?.role === 'admin' && (
            <button 
              onClick={() => { setCurrentView('users'); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'users' ? 'bg-white text-neutral-900 shadow-lg' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
            >
              <Users size={20} />
              <span className="font-semibold">Usuários</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-neutral-800">
          <div className="flex items-center gap-3 px-4 py-3 bg-neutral-800/50 rounded-xl mb-4">
            <div className="w-8 h-8 bg-neutral-700 rounded-full flex items-center justify-center text-xs font-bold">
              {user.username?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.username || 'Usuário'}</p>
              <p className="text-[10px] text-neutral-500 truncate">{user.role === 'admin' ? 'Administrador' : 'Padrão'}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="text-neutral-500 hover:text-red-500 transition-colors"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen p-4 md:p-8 relative">
        
        {/* Desktop Header */}
        <header className="hidden md:flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
          <div className="flex items-center gap-3">
            <Building2 size={32} className="text-blue-600" />
            <div>
              <h1 className="text-2xl font-black text-neutral-900 tracking-tighter">SERENNA MALL - CONTROLE DE GASTOS</h1>
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Sistema de Gestão Financeira de Obras</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-neutral-900">{user.username}</p>
              <p className="text-[10px] text-neutral-500 uppercase font-bold">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-neutral-200">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
              <Building2 size={24} className="text-neutral-900" />
              <h1 className="text-lg font-bold">SERENNA MALL - CONTROLE DE GASTOS</h1>
            </div>
          </div>
          <button onClick={handleLogout} className="text-neutral-400 hover:text-red-600">
            <LogOut size={20} />
          </button>
        </header>

        {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <AlertCircle className="text-red-600" />
              Confirmar Exclusão
            </h3>
            <p className="text-neutral-600 mb-4 text-sm">
              Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.
            </p>
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setDeleteModal({ isOpen: false, id: '', type: 'expense', error: '' })}
                className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {quickSupplierModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                <Truck className="text-blue-600" />
                Rápido Cadastro de Fornecedor
              </h3>
              <button 
                onClick={() => setQuickSupplierModal({ ...quickSupplierModal, isOpen: false })}
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleQuickAddSupplier} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">Nome da Empresa *</label>
                <input 
                  type="text" 
                  required
                  value={quickSupplierModal.name}
                  onChange={e => setQuickSupplierModal({...quickSupplierModal, name: e.target.value})}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="Ex: Fornecedor LTDA"
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">Contato</label>
                  <input 
                    type="text" 
                    value={quickSupplierModal.contact}
                    onChange={e => setQuickSupplierModal({...quickSupplierModal, contact: e.target.value})}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="(00) 0000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">Categoria</label>
                  <input 
                    type="text" 
                    value={quickSupplierModal.category}
                    onChange={e => setQuickSupplierModal({...quickSupplierModal, category: e.target.value})}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="Ex: Manutenção"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">Email</label>
                <input 
                  type="email" 
                  value={quickSupplierModal.email}
                  onChange={e => setQuickSupplierModal({...quickSupplierModal, email: e.target.value})}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="contato@empresa.com"
                />
              </div>
              
              <div className="flex justify-end gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setQuickSupplierModal({ ...quickSupplierModal, isOpen: false })}
                  className="px-6 py-2.5 text-neutral-600 hover:bg-neutral-100 rounded-xl font-bold transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all"
                >
                  Salvar Fornecedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        
        {currentView === 'dashboard' && (
          <>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-neutral-900 uppercase tracking-wider">Evolução da Obra</h2>
            </div>
            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Initial Balance */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-10 text-neutral-900">
                  <Wallet size={64} />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                    <Wallet size={24} />
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-600 uppercase tracking-wider">Saldo Inicial</h2>
                </div>
                
                {isEditingBalance ? (
                  <div className="flex flex-col gap-3 mt-4">
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        value={tempBalance}
                        onChange={(e) => setTempBalance(e.target.value)}
                        className="text-2xl font-bold text-neutral-900 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Novo Saldo"
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="password" 
                        value={balancePassword}
                        onChange={(e) => setBalancePassword(e.target.value)}
                        className="text-sm bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Senha de Admin"
                        onKeyDown={e => e.key === 'Enter' && handleSaveBalance()}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setIsEditingBalance(false);
                          setBalancePassword('');
                        }}
                        className="flex-1 bg-neutral-100 text-neutral-600 px-4 py-2 rounded-lg font-medium hover:bg-neutral-200 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleSaveBalance}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end justify-between mt-2">
                    <p className="text-4xl font-bold text-neutral-900 tracking-tight">
                      {formatCurrency(initialBalance)}
                    </p>
                    <button 
                      onClick={() => {
                        setTempBalance(initialBalance.toString());
                        setIsEditingBalance(true);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium underline opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                    >
                      <Edit2 size={14} /> Editar
                    </button>
                  </div>
                )}
              </div>

              {/* Total Expenses */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10 text-red-600">
                  <TrendingDown size={64} />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 text-red-700 rounded-lg">
                    <TrendingDown size={24} />
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-600 uppercase tracking-wider">Total de Gastos</h2>
                </div>
                <p className="text-4xl font-bold text-red-600 tracking-tight mt-2">
                  - {formatCurrency(totalExpenses)}
                </p>
              </div>

              {/* Current Balance */}
              <div className={`p-6 rounded-2xl shadow-sm border flex flex-col justify-between relative overflow-hidden ${currentBalance < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className={`absolute top-0 right-0 p-6 opacity-10 ${currentBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  <Receipt size={64} />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${currentBalance < 0 ? 'bg-red-200 text-red-800' : 'bg-emerald-200 text-emerald-800'}`}>
                    <Receipt size={24} />
                  </div>
                  <h2 className={`text-lg font-semibold uppercase tracking-wider ${currentBalance < 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                    Saldo Atual
                  </h2>
                </div>
                <p className={`text-4xl font-bold tracking-tight mt-2 ${currentBalance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {formatCurrency(currentBalance)}
                </p>
                {currentBalance < 0 && (
                  <div className="flex items-center gap-1 text-red-600 text-sm mt-2 font-medium">
                    <AlertCircle size={16} />
                    <span>Orçamento estourado!</span>
                  </div>
                )}
              </div>
            </div>
 
            {/* Cost Centers Management */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
                  <h3 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                    <PlusCircle className="text-blue-600" />
                    {editingCostCenterId ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
                  </h3>
                  <form onSubmit={editingCostCenterId ? (e) => { e.preventDefault(); saveEditCostCenter(); } : handleAddCostCenter} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Nome *</label>
                      <input 
                        type="text" 
                        required
                        value={editingCostCenterId ? editCostCenterForm.name : newCostCenter.name}
                        onChange={e => editingCostCenterId ? setEditCostCenterForm({...editCostCenterForm, name: e.target.value}) : setNewCostCenter({...newCostCenter, name: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Ex: Fundação, Alvenaria"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Orçamento Previsto (R$)</label>
                      <input 
                        type="number" 
                        value={editingCostCenterId ? editCostCenterForm.budget : newCostCenter.budget}
                        onChange={e => editingCostCenterId ? setEditCostCenterForm({...editCostCenterForm, budget: parseFloat(e.target.value)}) : setNewCostCenter({...newCostCenter, budget: parseFloat(e.target.value)})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      {editingCostCenterId && (
                        <button 
                          type="button"
                          onClick={() => { setEditingCostCenterId(null); setEditCostCenterForm({}); }}
                          className="flex-1 bg-neutral-100 text-neutral-600 font-bold py-3 rounded-xl hover:bg-neutral-200 transition-all"
                        >
                          Cancelar
                        </button>
                      )}
                      <button 
                        type="submit"
                        className="flex-[2] bg-neutral-900 text-white font-bold py-3 rounded-xl hover:bg-neutral-800 transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        {editingCostCenterId ? <Check size={20} /> : <Plus size={20} />}
                        {editingCostCenterId ? 'Salvar' : 'Adicionar'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                  <div className="p-6 border-b border-neutral-100">
                    <h3 className="text-xl font-bold text-neutral-900">Centros de Custo</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                          <th className="p-4">Nome</th>
                          <th className="p-4">Orçamento</th>
                          <th className="p-4 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {costCenters.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-8 text-center text-neutral-400 italic">Nenhum centro de custo cadastrado.</td>
                          </tr>
                        ) : (
                          costCenters.map(cc => (
                            editingCostCenterId === cc.id ? (
                              <tr key={cc.id} className="bg-blue-50/50">
                                <td className="p-4">
                                  <input
                                    type="text"
                                    value={editCostCenterForm.name || ''}
                                    onChange={e => setEditCostCenterForm({...editCostCenterForm, name: e.target.value})}
                                    className="w-full px-2 py-1 bg-white border border-neutral-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </td>
                                <td className="p-4">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editCostCenterForm.budget || ''}
                                    onChange={e => setEditCostCenterForm({...editCostCenterForm, budget: parseFloat(e.target.value)})}
                                    className="w-full px-2 py-1 bg-white border border-neutral-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center justify-center gap-1">
                                    <button onClick={saveEditCostCenter} className="text-emerald-600 hover:bg-emerald-100 p-2 rounded-lg transition-colors">
                                      <Check size={16} />
                                    </button>
                                    <button onClick={() => { setEditingCostCenterId(null); setEditCostCenterForm({}); }} className="text-neutral-500 hover:bg-neutral-200 p-2 rounded-lg transition-colors">
                                      <X size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              <tr key={cc.id} className="hover:bg-neutral-50 transition-colors">
                                <td className="p-4 font-bold text-neutral-900">{cc.name}</td>
                                <td className="p-4 text-neutral-600">{formatCurrency(cc.budget || 0)}</td>
                                <td className="p-4">
                                  <div className="flex items-center justify-center gap-1">
                                    <button 
                                      onClick={() => handleStartEditCostCenter(cc)}
                                      className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button 
                                      onClick={() => confirmDelete(cc.id, 'costCenter')}
                                      className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfico */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h3 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                <TrendingDown className="text-neutral-500" />
                Evolução do Saldo {filterStart || filterEnd ? '(Período Filtrado)' : ''}
              </h3>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      tickFormatter={(value) => {
                        if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
                        if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
                        return `R$ ${value}`;
                      }}
                      dx={-10}
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Saldo']}
                      labelStyle={{ color: '#111827', fontWeight: 'bold' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorBalance)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {currentView === 'suppliers' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Coluna de Formulário */}
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 sticky top-8">
                  <h3 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                    <PlusCircle className="text-blue-600" />
                    {editingSupplierId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                  </h3>
                  
                  <form onSubmit={editingSupplierId ? (e) => { e.preventDefault(); saveEditSupplier(); } : handleAddSupplier} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Nome / Razão Social *</label>
                      <input 
                        type="text" 
                        required
                        value={editingSupplierId ? editSupplierForm.name : newSupplier.name}
                        onChange={e => editingSupplierId ? setEditSupplierForm({...editSupplierForm, name: e.target.value}) : setNewSupplier({...newSupplier, name: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Ex: Construtora Silva"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Categoria</label>
                      <input 
                        type="text" 
                        value={editingSupplierId ? editSupplierForm.category : newSupplier.category}
                        onChange={e => editingSupplierId ? setEditSupplierForm({...editSupplierForm, category: e.target.value}) : setNewSupplier({...newSupplier, category: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Ex: Materiais, Serviços"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Contato / Telefone</label>
                      <input 
                        type="text" 
                        value={editingSupplierId ? editSupplierForm.contact : newSupplier.contact}
                        onChange={e => editingSupplierId ? setEditSupplierForm({...editSupplierForm, contact: e.target.value}) : setNewSupplier({...newSupplier, contact: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">E-mail</label>
                      <input 
                        type="email" 
                        value={editingSupplierId ? editSupplierForm.email : newSupplier.email}
                        onChange={e => editingSupplierId ? setEditSupplierForm({...editSupplierForm, email: e.target.value}) : setNewSupplier({...newSupplier, email: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="contato@empresa.com"
                      />
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      {editingSupplierId && (
                        <button 
                          type="button"
                          onClick={() => { setEditingSupplierId(null); setEditSupplierForm({}); }}
                          className="flex-1 bg-neutral-100 text-neutral-600 font-bold py-3 rounded-xl hover:bg-neutral-200 transition-all"
                        >
                          Cancelar
                        </button>
                      )}
                      <button 
                        type="submit"
                        className="flex-[2] bg-neutral-900 text-white font-bold py-3 rounded-xl hover:bg-neutral-800 transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        {editingSupplierId ? <Check size={20} /> : <Plus size={20} />}
                        {editingSupplierId ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Coluna de Lista */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                  <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-neutral-900">Lista de Fornecedores</h3>
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                      {suppliers.length} Total
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                          <th className="p-4">Nome</th>
                          <th className="p-4">Categoria</th>
                          <th className="p-4">Contato</th>
                          <th className="p-4 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {suppliers.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-neutral-400 italic">Nenhum fornecedor cadastrado.</td>
                          </tr>
                        ) : (
                          suppliers.map(s => (
                            <tr key={s.id} className="hover:bg-neutral-50 transition-colors group">
                              <td className="p-4">
                                <p className="font-bold text-neutral-900">{s.name}</p>
                                <p className="text-xs text-neutral-500">{s.email || 'Sem e-mail'}</p>
                              </td>
                              <td className="p-4">
                                <span className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded text-[10px] font-bold uppercase">
                                  {s.category || 'Geral'}
                                </span>
                              </td>
                              <td className="p-4 text-sm text-neutral-600">{s.contact || '-'}</td>
                              <td className="p-4">
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => handleStartEditSupplier(s)}
                                    className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button 
                                    onClick={() => confirmDelete(s.id, 'supplier')}
                                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'clients' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Coluna de Formulário */}
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 sticky top-8">
                  <h3 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                    <PlusCircle className="text-emerald-600" />
                    {editingClientId ? 'Editar Cliente' : 'Novo Cliente'}
                  </h3>
                  
                  <form onSubmit={editingClientId ? (e) => { e.preventDefault(); saveEditClient(); } : handleAddClient} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Nome do Cliente *</label>
                      <input 
                        type="text" 
                        required
                        value={editingClientId ? editClientForm.name : newClient.name}
                        onChange={e => editingClientId ? setEditClientForm({...editClientForm, name: e.target.value}) : setNewClient({...newClient, name: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Ex: João da Silva"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Projeto / Unidade</label>
                      <input 
                        type="text" 
                        value={editingClientId ? editClientForm.project : newClient.project}
                        onChange={e => editingClientId ? setEditClientForm({...editClientForm, project: e.target.value}) : setNewClient({...newClient, project: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Ex: Loja 101, Quiosque A"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Contato / Telefone</label>
                      <input 
                        type="text" 
                        value={editingClientId ? editClientForm.contact : newClient.contact}
                        onChange={e => editingClientId ? setEditClientForm({...editClientForm, contact: e.target.value}) : setNewClient({...newClient, contact: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">E-mail</label>
                      <input 
                        type="email" 
                        value={editingClientId ? editClientForm.email : newClient.email}
                        onChange={e => editingClientId ? setEditClientForm({...editClientForm, email: e.target.value}) : setNewClient({...newClient, email: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="cliente@email.com"
                      />
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      {editingClientId && (
                        <button 
                          type="button"
                          onClick={() => { setEditingClientId(null); setEditClientForm({}); }}
                          className="flex-1 bg-neutral-100 text-neutral-600 font-bold py-3 rounded-xl hover:bg-neutral-200 transition-all"
                        >
                          Cancelar
                        </button>
                      )}
                      <button 
                        type="submit"
                        className="flex-[2] bg-neutral-900 text-white font-bold py-3 rounded-xl hover:bg-neutral-800 transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        {editingClientId ? <Check size={20} /> : <Plus size={20} />}
                        {editingClientId ? 'Salvar Alterações' : 'Cadastrar Cliente'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Coluna de Lista */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                  <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-neutral-900">Lista de Clientes</h3>
                    <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">
                      {clients.length} Total
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                          <th className="p-4">Nome</th>
                          <th className="p-4">Projeto</th>
                          <th className="p-4">Contato</th>
                          <th className="p-4 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {clients.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-neutral-400 italic">Nenhum cliente cadastrado.</td>
                          </tr>
                        ) : (
                          clients.map(c => (
                            <tr key={c.id} className="hover:bg-neutral-50 transition-colors group">
                              <td className="p-4">
                                <p className="font-bold text-neutral-900">{c.name}</p>
                                <p className="text-xs text-neutral-500">{c.email || 'Sem e-mail'}</p>
                              </td>
                              <td className="p-4">
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">
                                  {c.project || 'Geral'}
                                </span>
                              </td>
                              <td className="p-4 text-sm text-neutral-600">{c.contact || '-'}</td>
                              <td className="p-4">
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => handleStartEditClient(c)}
                                    className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button 
                                    onClick={() => confirmDelete(c.id, 'client')}
                                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'expenses' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Coluna Esquerda: Formulário */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 sticky top-8">
                <h3 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                  <PlusCircle className="text-blue-600" />
                  {editingId ? 'Editar Lançamento' : 'Novo Lançamento'}
                </h3>
                
                <form onSubmit={editingId ? (e) => { e.preventDefault(); saveEdit(); } : handleAddExpense} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Data *</label>
                      <input 
                        type="date" 
                        required
                        value={editingId ? editForm.date || '' : newExpense.date}
                        onChange={e => editingId ? setEditForm({...editForm, date: e.target.value}) : setNewExpense({...newExpense, date: e.target.value})}
                        className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Vencimento</label>
                      <input 
                        type="date" 
                        value={editingId ? editForm.dueDate || '' : newExpense.dueDate}
                        onChange={e => editingId ? setEditForm({...editForm, dueDate: e.target.value}) : setNewExpense({...newExpense, dueDate: e.target.value})}
                        className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-1">Fornecedor *</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                          <User size={18} />
                        </div>
                        <select 
                          required
                          value={editingId ? editForm.supplier || '' : newExpense.supplier}
                          onChange={e => editingId ? setEditForm({...editForm, supplier: e.target.value}) : setNewExpense({...newExpense, supplier: e.target.value})}
                          className="w-full pl-10 pr-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none appearance-none"
                        >
                          <option value="">Selecione um fornecedor</option>
                          {suppliers.sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                          {/* Fallback for values not in the current suppliers list */}
                          {(editingId ? editForm.supplier : newExpense.supplier) && !suppliers.find(s => s.name === (editingId ? editForm.supplier : newExpense.supplier)) && (
                            <option value={editingId ? editForm.supplier : newExpense.supplier}>
                              {editingId ? editForm.supplier : newExpense.supplier} (Não cadastrado)
                            </option>
                          )}
                        </select>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setQuickSupplierModal({ ...quickSupplierModal, isOpen: true })}
                        className="p-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all"
                        title="Cadastrar novo fornecedor"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-1">Valor (R$) *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                        <DollarSign size={18} />
                      </div>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0.01"
                        required
                        value={editingId ? editForm.amount || '' : newExpense.amount || ''}
                        onChange={e => editingId ? setEditForm({...editForm, amount: parseFloat(e.target.value)}) : setNewExpense({...newExpense, amount: parseFloat(e.target.value)})}
                        className="w-full pl-10 pr-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none text-lg font-semibold text-red-600"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-1">Nº da Nota / Fatura</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                        <FileText size={18} />
                      </div>
                      <input 
                        type="text" 
                        value={editingId ? editForm.invoiceNumber || '' : newExpense.invoiceNumber}
                        onChange={e => editingId ? setEditForm({...editForm, invoiceNumber: e.target.value}) : setNewExpense({...newExpense, invoiceNumber: e.target.value})}
                        className="w-full pl-10 pr-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                        placeholder="Ex: NF-1234"
                      />
                    </div>
                  </div>

                  {!editingId && (
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Parcelas</label>
                      <input 
                        type="number" 
                        min="1"
                        max="60"
                        value={newExpense.installments || 1}
                        onChange={e => setNewExpense({...newExpense, installments: parseInt(e.target.value)})}
                        className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                      />
                      <p className="text-xs text-neutral-500 mt-1">Lançará o mesmo valor mensalmente.</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    {editingId && (
                      <button 
                        type="button"
                        onClick={cancelEdit}
                        className="flex-1 bg-neutral-100 text-neutral-600 font-bold py-3.5 rounded-xl hover:bg-neutral-200 transition-all"
                      >
                        Cancelar
                      </button>
                    )}
                    <button 
                      type="submit"
                      className="flex-[2] bg-neutral-900 text-white font-bold py-3.5 rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-md"
                    >
                      {editingId ? <Check size={20} /> : <Plus size={20} />}
                      {editingId ? 'Salvar Alterações' : 'Lançar Despesa'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Tabela */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="p-6 border-b border-neutral-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h3 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                    <Receipt className="text-neutral-500" />
                    Histórico de Lançamentos
                  </h3>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200 w-full sm:w-auto">
                      <User size={16} className="text-neutral-400" />
                      <input 
                        type="text" 
                        placeholder="Filtrar Fornecedor..."
                        value={filterSupplier}
                        onChange={e => setFilterSupplier(e.target.value)}
                        className="bg-transparent border-none text-sm focus:ring-0 p-0 text-neutral-600 w-full sm:w-auto outline-none"
                      />
                      {filterSupplier && (
                        <button onClick={() => setFilterSupplier('')} className="text-neutral-400 hover:text-red-500 ml-1 transition-colors">
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200 w-full sm:w-auto">
                      <Filter size={16} className="text-neutral-400" />
                      <select 
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value as any)}
                        className="bg-transparent border-none text-sm focus:ring-0 p-0 text-neutral-600 w-full sm:w-auto outline-none appearance-none cursor-pointer"
                      >
                        <option value="all">Todos os Status</option>
                        <option value="pending">Pendentes</option>
                        <option value="paid">Pagos</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200 w-full sm:w-auto">
                      <Filter size={16} className="text-neutral-400" />
                      <input 
                        type="date" 
                        value={filterStart}
                        onChange={e => setFilterStart(e.target.value)}
                        className="bg-transparent border-none text-sm focus:ring-0 p-0 text-neutral-600 w-full sm:w-auto outline-none"
                      />
                      <span className="text-neutral-400">até</span>
                      <input 
                        type="date" 
                        value={filterEnd}
                        onChange={e => setFilterEnd(e.target.value)}
                        className="bg-transparent border-none text-sm focus:ring-0 p-0 text-neutral-600 w-full sm:w-auto outline-none"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 text-neutral-500 text-sm uppercase tracking-wider">
                        <th className="p-4 font-semibold border-b border-neutral-200">Data</th>
                        <th className="p-4 font-semibold border-b border-neutral-200">Vencimento</th>
                        <th className="p-4 font-semibold border-b border-neutral-200">Fornecedor</th>
                        <th className="p-4 font-semibold border-b border-neutral-200 text-right">Valor</th>
                        <th className="p-4 font-semibold border-b border-neutral-200 text-center">Status</th>
                        <th className="p-4 font-semibold border-b border-neutral-200 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {filteredExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-neutral-500">
                            Nenhum lançamento encontrado.
                          </td>
                        </tr>
                      ) : (
                        filteredExpenses.map((expense) => (
                          <tr key={expense.id} className={`hover:bg-neutral-50 transition-colors group ${editingId === expense.id ? 'bg-blue-50/50' : ''}`}>
                            <td className="p-4 text-neutral-900 font-medium whitespace-nowrap">
                              {formatDate(expense.date)}
                            </td>
                            <td className="p-4 text-neutral-600 text-sm whitespace-nowrap">
                              {expense.dueDate ? formatDate(expense.dueDate) : '-'}
                            </td>
                            <td className="p-4 text-neutral-900 font-semibold">
                              {expense.supplier}
                            </td>
                            <td className="p-4 text-right font-bold text-red-600 whitespace-nowrap">
                              - {formatCurrency(expense.amount)}
                            </td>
                            <td className="p-4 text-center">
                              <button 
                                onClick={() => handleToggleStatus(expense)}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${expense.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                              >
                                {expense.status === 'paid' ? 'Pago' : 'Pendente'}
                              </button>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => handleStartEdit(expense)}
                                  className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={() => handleConfirmDelete(expense.id)}
                                  className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200">
              <h3 className="text-2xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                <BarChart3 className="text-blue-600" />
                Central de Relatórios
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl">
                  <FileSpreadsheet size={32} className="text-emerald-600 mb-4" />
                  <h4 className="text-lg font-bold text-emerald-900 mb-2">Exportar Excel</h4>
                  <p className="text-emerald-700 text-sm mb-6">Gere uma planilha completa com todos os lançamentos filtrados para análise detalhada.</p>
                  <button 
                    onClick={exportToExcel}
                    className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={20} />
                    Baixar Planilha (.xlsx)
                  </button>
                </div>

                <div className="p-6 bg-red-50 border border-red-100 rounded-2xl">
                  <FileIcon size={32} className="text-red-600 mb-4" />
                  <h4 className="text-lg font-bold text-red-900 mb-2">Exportar PDF</h4>
                  <p className="text-red-700 text-sm mb-6">Gere um documento formatado pronto para impressão com o resumo do período.</p>
                  <button 
                    onClick={exportToPDF}
                    className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={20} />
                    Baixar Relatório (.pdf)
                  </button>
                </div>
              </div>
            </div>
 
            {/* Seção de Relatórios Salvos */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                  <Bookmark className="text-blue-600" />
                  Modelos de Relatórios Salvos
                </h3>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Nome do modelo..."
                    value={newSavedReportName}
                    onChange={e => setNewSavedReportName(e.target.value)}
                    className="px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  <button 
                    onClick={handleSaveReportTemplate}
                    disabled={!newSavedReportName}
                    className="bg-neutral-900 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-neutral-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Save size={16} />
                    Salvar Filtro Atual
                  </button>
                </div>
              </div>
 
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedReports.length === 0 ? (
                  <div className="col-span-full p-8 text-center text-neutral-400 italic border-2 border-dashed border-neutral-100 rounded-2xl">
                    Nenhum modelo de relatório salvo.
                  </div>
                ) : (
                  savedReports.map(report => (
                    <div key={report.id} className="group bg-neutral-50 p-4 rounded-xl border border-neutral-200 hover:border-blue-300 hover:shadow-md transition-all relative">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-neutral-900">{report.name}</h4>
                        <button 
                          onClick={() => confirmDelete(report.id, 'savedReport')}
                          className="text-neutral-400 hover:text-red-600 p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="space-y-1 text-xs text-neutral-500">
                        <p>Período: {report.filterStart || 'Início'} - {report.filterEnd || 'Fim'}</p>
                        <p>Fornecedor: {report.filterSupplier || 'Todos'}</p>
                      </div>
                      <button 
                        onClick={() => {
                          setFilterStart(report.filterStart);
                          setFilterEnd(report.filterEnd);
                          setFilterSupplier(report.filterSupplier);
                          setFilterStatus(report.filterStatus || 'all');
                        }}
                        className="mt-4 w-full bg-white border border-neutral-300 text-neutral-700 py-2 rounded-lg text-xs font-bold hover:bg-neutral-50 transition-all flex items-center justify-center gap-2"
                      >
                        <Play size={12} />
                        Aplicar Filtro
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
 
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h4 className="text-lg font-bold text-neutral-900 mb-4">Filtros Ativos para Exportação</h4>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-500 font-bold uppercase">Data Inicial</span>
                  <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="border-b border-neutral-300 py-1 outline-none focus:border-blue-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-500 font-bold uppercase">Data Final</span>
                  <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="border-b border-neutral-300 py-1 outline-none focus:border-blue-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-500 font-bold uppercase">Status</span>
                  <select 
                    value={filterStatus} 
                    onChange={e => setFilterStatus(e.target.value as any)} 
                    className="border-b border-neutral-300 py-1 outline-none focus:border-blue-500 bg-transparent"
                  >
                    <option value="all">Todos</option>
                    <option value="pending">Pendentes</option>
                    <option value="paid">Pagos</option>
                  </select>
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-xs text-neutral-500 font-bold uppercase">Fornecedor</span>
                  <input type="text" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} placeholder="Todos os fornecedores" className="border-b border-neutral-300 py-1 outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'users' && user?.role === 'admin' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 sticky top-8">
                  <h3 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                    <PlusCircle className="text-neutral-900" />
                    Novo Usuário
                  </h3>
                  <form onSubmit={handleAddUser} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Usuário *</label>
                      <input 
                        type="text" 
                        required
                        value={newUserForm.username}
                        onChange={e => setNewUserForm({...newUserForm, username: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none"
                        placeholder="Ex: joao.silva"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Senha *</label>
                      <input 
                        type="password" 
                        required
                        value={newUserForm.password}
                        onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none"
                        placeholder="Mínimo 4 caracteres"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">Nível de Acesso</label>
                      <select 
                        value={newUserForm.role}
                        onChange={e => setNewUserForm({...newUserForm, role: e.target.value as any})}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none"
                      >
                        <option value="standard">Padrão (Apenas Visualização/Lançamento)</option>
                        <option value="admin">Administrador (Controle Total)</option>
                      </select>
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-neutral-900 text-white font-bold py-3 rounded-xl hover:bg-neutral-800 transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <Plus size={20} />
                      Cadastrar Usuário
                    </button>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                  <div className="p-6 border-b border-neutral-100">
                    <h3 className="text-xl font-bold text-neutral-900">Usuários do Sistema</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                          <th className="p-4">Usuário</th>
                          <th className="p-4">Nível</th>
                          <th className="p-4 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {allUsers.map(u => (
                          <tr key={u.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="p-4 font-bold text-neutral-900">{u.username}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-600'}`}>
                                {u.role === 'admin' ? 'Administrador' : 'Padrão'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => confirmDelete(u.id, 'user' as any)}
                                  className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                  disabled={u.id === user?.id}
                                  title={u.id === user?.id ? "Você não pode excluir seu próprio usuário" : "Excluir usuário"}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  </div>
);
}
