import type { SummaryMetricId } from "@/components/dashboard/types";

import { defaultLocale, type Locale } from "./config";

export interface DashboardDictionary {
  nav: {
    title: string;
    subtitle: string;
    localeReady: string;
  };
  summary: {
    cards: Record<
      SummaryMetricId,
      {
        title: string;
        description: string;
      }
    >;
  };
  planner: {
    title: string;
    rowLabel: string;
    assignedBoatLabel: string;
    status: {
      scheduled: string;
      pending: string;
      overdue: string;
    };
  };
  insights: {
    title: string;
    messages: Record<string, string>;
  };
  fleet: {
    title: string;
    columns: {
      boatName: string;
      type: string;
      status: string;
    };
    status: {
      available: string;
      turnaround: string;
      overdue: string;
    };
  };
}

const dictionaries: Record<Locale, DashboardDictionary> = {
  "en-US": {
    nav: {
      title: "Operations Dashboard",
      subtitle: "Fleet Planning Control",
      localeReady: "Localization-ready",
    },
    summary: {
      cards: {
        boatsDueToday: {
          title: "Boats Due Today",
          description: "Scheduled across active marinas",
        },
        overdueBoats: {
          title: "Overdue Boats",
          description: "Past target maintenance window",
        },
        availableTechnicians: {
          title: "Available Technicians",
          description: "Ready for tomorrow's plan",
        },
        spareCapacity: {
          title: "Spare Capacity",
          description: "Unassigned team bandwidth",
        },
      },
    },
    planner: {
      title: "Tomorrow Planner",
      rowLabel: "Technician",
      assignedBoatLabel: "Assigned Boat",
      status: {
        scheduled: "Scheduled",
        pending: "Pending",
        overdue: "Overdue",
      },
    },
    insights: {
      title: "System Insights",
      messages: {
        techAvailableTomorrow: "2 technicians available tomorrow",
        oneBoatOverdue: "1 boat overdue",
        maintenanceWindowOpen: "Maintenance window available",
        criticalTasksCovered: "All critical tasks covered",
        partsArrivalUpdate: "Spare parts delivery expected by 06:30",
      },
    },
    fleet: {
      title: "Fleet Status Overview",
      columns: {
        boatName: "Boat Name",
        type: "Type",
        status: "Status",
      },
      status: {
        available: "Available",
        turnaround: "In Turnaround",
        overdue: "Overdue",
      },
    },
  },
  "en-GB": {
    nav: {
      title: "Operations Dashboard",
      subtitle: "Fleet Planning Control",
      localeReady: "Localisation-ready",
    },
    summary: {
      cards: {
        boatsDueToday: {
          title: "Boats Due Today",
          description: "Scheduled across active marinas",
        },
        overdueBoats: {
          title: "Overdue Boats",
          description: "Past target maintenance window",
        },
        availableTechnicians: {
          title: "Available Technicians",
          description: "Ready for tomorrow's plan",
        },
        spareCapacity: {
          title: "Spare Capacity",
          description: "Unassigned team capacity",
        },
      },
    },
    planner: {
      title: "Tomorrow Planner",
      rowLabel: "Technician",
      assignedBoatLabel: "Assigned Boat",
      status: {
        scheduled: "Scheduled",
        pending: "Pending",
        overdue: "Overdue",
      },
    },
    insights: {
      title: "System Insights",
      messages: {
        techAvailableTomorrow: "2 technicians available tomorrow",
        oneBoatOverdue: "1 boat overdue",
        maintenanceWindowOpen: "Maintenance window available",
        criticalTasksCovered: "All critical tasks covered",
        partsArrivalUpdate: "Spare parts delivery expected by 06:30",
      },
    },
    fleet: {
      title: "Fleet Status Overview",
      columns: {
        boatName: "Boat Name",
        type: "Type",
        status: "Status",
      },
      status: {
        available: "Available",
        turnaround: "In Turnaround",
        overdue: "Overdue",
      },
    },
  },
  "es-ES": {
    nav: {
      title: "Panel de Operaciones",
      subtitle: "Control de Planificación de Flota",
      localeReady: "Listo para localización",
    },
    summary: {
      cards: {
        boatsDueToday: {
          title: "Barcos para Hoy",
          description: "Programados en marinas activas",
        },
        overdueBoats: {
          title: "Barcos Atrasados",
          description: "Fuera de la ventana de mantenimiento",
        },
        availableTechnicians: {
          title: "Técnicos Disponibles",
          description: "Listos para el plan de mañana",
        },
        spareCapacity: {
          title: "Capacidad Libre",
          description: "Capacidad del equipo sin asignar",
        },
      },
    },
    planner: {
      title: "Planificador de Mañana",
      rowLabel: "Técnico",
      assignedBoatLabel: "Barco Asignado",
      status: {
        scheduled: "Programado",
        pending: "Pendiente",
        overdue: "Atrasado",
      },
    },
    insights: {
      title: "Información del Sistema",
      messages: {
        techAvailableTomorrow: "2 técnicos disponibles mañana",
        oneBoatOverdue: "1 barco atrasado",
        maintenanceWindowOpen: "Ventana de mantenimiento disponible",
        criticalTasksCovered: "Todas las tareas críticas cubiertas",
        partsArrivalUpdate: "Entrega de repuestos prevista para las 06:30",
      },
    },
    fleet: {
      title: "Resumen de Estado de Flota",
      columns: {
        boatName: "Nombre del Barco",
        type: "Tipo",
        status: "Estado",
      },
      status: {
        available: "Disponible",
        turnaround: "En Rotación",
        overdue: "Atrasado",
      },
    },
  },
  "fr-FR": {
    nav: {
      title: "Tableau d'Opérations",
      subtitle: "Pilotage de Planification de Flotte",
      localeReady: "Prêt pour la localisation",
    },
    summary: {
      cards: {
        boatsDueToday: {
          title: "Bateaux Prévus Aujourd'hui",
          description: "Planifiés sur les marinas actives",
        },
        overdueBoats: {
          title: "Bateaux en Retard",
          description: "Hors fenêtre de maintenance",
        },
        availableTechnicians: {
          title: "Techniciens Disponibles",
          description: "Prêts pour le plan de demain",
        },
        spareCapacity: {
          title: "Capacité Restante",
          description: "Ressources équipe non affectées",
        },
      },
    },
    planner: {
      title: "Planificateur de Demain",
      rowLabel: "Technicien",
      assignedBoatLabel: "Bateau Assigné",
      status: {
        scheduled: "Planifié",
        pending: "En attente",
        overdue: "En retard",
      },
    },
    insights: {
      title: "Informations Système",
      messages: {
        techAvailableTomorrow: "2 techniciens disponibles demain",
        oneBoatOverdue: "1 bateau en retard",
        maintenanceWindowOpen: "Fenêtre de maintenance disponible",
        criticalTasksCovered: "Toutes les tâches critiques sont couvertes",
        partsArrivalUpdate: "Livraison des pièces prévue à 06h30",
      },
    },
    fleet: {
      title: "Vue d'Ensemble de la Flotte",
      columns: {
        boatName: "Nom du Bateau",
        type: "Type",
        status: "Statut",
      },
      status: {
        available: "Disponible",
        turnaround: "En Rotation",
        overdue: "En retard",
      },
    },
  },
  "af-ZA": {
    nav: {
      title: "Operasies Paneel",
      subtitle: "Vlootbeplanning Beheer",
      localeReady: "Gereed vir lokalisering",
    },
    summary: {
      cards: {
        boatsDueToday: {
          title: "Bote Vandag Verskuldig",
          description: "Geskeduleer oor aktiewe marinas",
        },
        overdueBoats: {
          title: "Agterstallige Bote",
          description: "Buite onderhoudsvenster",
        },
        availableTechnicians: {
          title: "Beskikbare Tegnici",
          description: "Gereed vir môre se plan",
        },
        spareCapacity: {
          title: "Spare Kapasiteit",
          description: "Ongeallokeerde span kapasiteit",
        },
      },
    },
    planner: {
      title: "Môre Beplanner",
      rowLabel: "Tegnikus",
      assignedBoatLabel: "Toegewyde Boot",
      status: {
        scheduled: "Geskeduleer",
        pending: "Hangende",
        overdue: "Agterstallig",
      },
    },
    insights: {
      title: "Stelsel Insigte",
      messages: {
        techAvailableTomorrow: "2 tegnici beskikbaar môre",
        oneBoatOverdue: "1 boot agterstallig",
        maintenanceWindowOpen: "Onderhoudsvenster beskikbaar",
        criticalTasksCovered: "Alle kritieke take is gedek",
        partsArrivalUpdate: "Onderdele aflewering verwag teen 06:30",
      },
    },
    fleet: {
      title: "Vloot Status Oorsig",
      columns: {
        boatName: "Boot Naam",
        type: "Tipe",
        status: "Status",
      },
      status: {
        available: "Beskikbaar",
        turnaround: "In Omdraai",
        overdue: "Agterstallig",
      },
    },
  },
  "zh-CN": {
    nav: {
      title: "运营仪表盘",
      subtitle: "船队计划控制",
      localeReady: "支持多语言",
    },
    summary: {
      cards: {
        boatsDueToday: {
          title: "今日到期船只",
          description: "覆盖所有活跃码头",
        },
        overdueBoats: {
          title: "逾期船只",
          description: "超过维护窗口",
        },
        availableTechnicians: {
          title: "可用技师",
          description: "可用于明日计划",
        },
        spareCapacity: {
          title: "剩余产能",
          description: "未分配团队容量",
        },
      },
    },
    planner: {
      title: "明日计划",
      rowLabel: "技师",
      assignedBoatLabel: "分配船只",
      status: {
        scheduled: "已排程",
        pending: "待处理",
        overdue: "逾期",
      },
    },
    insights: {
      title: "系统洞察",
      messages: {
        techAvailableTomorrow: "明天有 2 名技师可用",
        oneBoatOverdue: "1 艘船逾期",
        maintenanceWindowOpen: "有可用维护窗口",
        criticalTasksCovered: "所有关键任务已覆盖",
        partsArrivalUpdate: "备件预计 06:30 到达",
      },
    },
    fleet: {
      title: "船队状态总览",
      columns: {
        boatName: "船名",
        type: "类型",
        status: "状态",
      },
      status: {
        available: "可用",
        turnaround: "周转中",
        overdue: "逾期",
      },
    },
  },
  "hi-IN": {
    nav: {
      title: "ऑपरेशंस डैशबोर्ड",
      subtitle: "फ्लीट प्लानिंग कंट्रोल",
      localeReady: "लोकलाइज़ेशन के लिए तैयार",
    },
    summary: {
      cards: {
        boatsDueToday: {
          title: "आज देय नावें",
          description: "सभी सक्रिय मरीना में निर्धारित",
        },
        overdueBoats: {
          title: "ओवरड्यू नावें",
          description: "मेंटेनेंस विंडो से बाहर",
        },
        availableTechnicians: {
          title: "उपलब्ध तकनीशियन",
          description: "कल की योजना के लिए तैयार",
        },
        spareCapacity: {
          title: "स्पेयर क्षमता",
          description: "अनअसाइंड टीम क्षमता",
        },
      },
    },
    planner: {
      title: "कल का प्लानर",
      rowLabel: "तकनीशियन",
      assignedBoatLabel: "असाइंड नाव",
      status: {
        scheduled: "निर्धारित",
        pending: "लंबित",
        overdue: "ओवरड्यू",
      },
    },
    insights: {
      title: "सिस्टम इनसाइट्स",
      messages: {
        techAvailableTomorrow: "कल 2 तकनीशियन उपलब्ध हैं",
        oneBoatOverdue: "1 नाव ओवरड्यू है",
        maintenanceWindowOpen: "मेंटेनेंस विंडो उपलब्ध है",
        criticalTasksCovered: "सभी महत्वपूर्ण कार्य कवर हैं",
        partsArrivalUpdate: "स्पेयर पार्ट्स 06:30 तक अपेक्षित हैं",
      },
    },
    fleet: {
      title: "फ्लीट स्टेटस ओवरव्यू",
      columns: {
        boatName: "नाव का नाम",
        type: "प्रकार",
        status: "स्थिति",
      },
      status: {
        available: "उपलब्ध",
        turnaround: "टर्नअराउंड में",
        overdue: "ओवरड्यू",
      },
    },
  },
};

export function getDictionary(locale: Locale = defaultLocale): DashboardDictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}
