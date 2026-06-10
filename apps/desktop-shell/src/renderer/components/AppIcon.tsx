/**
 * AppIcon — unified icon renderer for AppDefinition.icon values.
 *
 * Format detection:
 *   "lucide:BarChart3"       → Lucide component from LUCIDE_ICONS map
 *   "data:image/..."         → <img> with object-fit cover
 *   anything else            → raw text/emoji span
 */
import type { LucideIcon } from 'lucide-react';
import {
  Activity, AlertTriangle, ArrowDownUp, ArrowLeftRight, ArrowRightLeft, ArrowUpDown,
  BarChart2, BarChart3, BarChart4, Bell, BookMarked, BookOpen, Briefcase,
  Building, Building2, Calculator, Calendar, ChartArea, ChartBar, ChartCandlestick,
  ChartLine, ChartNoAxesCombined, ChartPie, ChartScatter, CircleDollarSign,
  ClipboardList, Clock, Cloud, Coins, CreditCard, Database,
  DollarSign, FileBarChart, FileBarChart2, FileCheck, FileCog, FileLineChart,
  FileSearch, FileText, Filter, Flag, Folder, Gauge, Globe,
  HandCoins, History, House, Info, Key, Landmark, LayoutDashboard,
  LayoutGrid, LineChart, Link, Lock, Mail, Map, MessageSquare,
  Monitor, Network, PieChart, Receipt, RefreshCw, Scale,
  Search, Settings, Shield, ShieldCheck, Signal, Sliders, Star,
  Tag, Target, Terminal, TrendingDown, TrendingUp, Truck, Unlink,
  User, UserCheck, Users, Wallet, Workflow, Zap,
} from 'lucide-react';

export const LUCIDE_ICONS: Record<string, LucideIcon> = {
  Activity, AlertTriangle, ArrowDownUp, ArrowLeftRight, ArrowRightLeft, ArrowUpDown,
  BarChart2, BarChart3, BarChart4, Bell, BookMarked, BookOpen, Briefcase,
  Building, Building2, Calculator, Calendar, ChartArea, ChartBar, ChartCandlestick,
  ChartLine, ChartNoAxesCombined, ChartPie, ChartScatter, CircleDollarSign,
  ClipboardList, Clock, Cloud, Coins, CreditCard, Database,
  DollarSign, FileBarChart, FileBarChart2, FileCheck, FileCog, FileLineChart,
  FileSearch, FileText, Filter, Flag, Folder, Gauge, Globe,
  HandCoins, History, House, Info, Key, Landmark, LayoutDashboard,
  LayoutGrid, LineChart, Link, Lock, Mail, Map, MessageSquare,
  Monitor, Network, PieChart, Receipt, RefreshCw, Scale,
  Search, Settings, Shield, ShieldCheck, Signal, Sliders, Star,
  Tag, Target, Terminal, TrendingDown, TrendingUp, Truck, Unlink,
  User, UserCheck, Users, Wallet, Workflow, Zap,
};

interface AppIconProps {
  icon?: string | null;
  fallback?: string;
  size?: number;
  className?: string;
}

export function AppIcon({ icon, fallback = '?', size = 20, className }: AppIconProps) {
  if (!icon) {
    return <span className={className} style={{ fontSize: size * 0.75, lineHeight: 1 }}>{fallback}</span>;
  }
  if (icon.startsWith('lucide:')) {
    const name = icon.slice(7);
    const Icon = LUCIDE_ICONS[name];
    if (Icon) return <Icon size={size} className={className} />;
    return <span className={className} style={{ fontSize: size * 0.75, lineHeight: 1 }}>{fallback}</span>;
  }
  if (icon.startsWith('data:image/')) {
    return (
      <img
        src={icon}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }}
        alt=""
      />
    );
  }
  return <span className={className} style={{ fontSize: size * 0.75, lineHeight: 1 }}>{icon}</span>;
}
