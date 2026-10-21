import { brand } from "@/config/app-config";
import { priceForDuration } from "@/domain/booking-rules";
import { money as toMoney } from "@/domain/money";
import type {
  AppNotification,
  AvailabilityWindow,
  Booking,
  Conversation,
  LocalizedText,
  Message,
  Review,
  StudentProfile,
  Subject,
  TutorProfile,
  UserAccount,
} from "@/domain/types";

/**
 * PROTOTYPE DATA ONLY. Every record produced here is fictional and flagged `isDemo`.
 * Dates are generated relative to the moment the demo is first opened so the
 * prototype always shows upcoming lessons.
 */

export const DEMO_PASSWORD = "demo1234";
export const DEMO_STUDENT_EMAIL = "sara@demo.naqraw";
export const DEMO_TUTOR_EMAIL = "youssef@demo.naqraw";

export interface MockUser extends UserAccount {
  /** Prototype only: plain-text demo password kept in the browser. Never do this in production. */
  password: string;
}

export interface MockState {
  version: number;
  seededAt: string;
  sessionUserId: string | null;
  users: MockUser[];
  students: StudentProfile[];
  tutors: TutorProfile[];
  subjects: Subject[];
  reviews: Review[];
  favorites: { userId: string; tutorId: string }[];
  bookings: Booking[];
  conversations: Conversation[];
  messages: Message[];
  notifications: AppNotification[];
  profileViews: Record<string, number>;
}

export const MOCK_STATE_VERSION = 4;

const money = (major: number) => toMoney(major, brand.currency);

// ─── Subjects ───────────────────────────────────────────────────────────────

const subjects: Subject[] = [
  { id: "s-calculus", slug: "calculus", category: "math", name: { ar: "التحليل الرياضي", en: "Calculus" } },
  { id: "s-algebra", slug: "linear-algebra", category: "math", name: { ar: "الجبر الخطي", en: "Linear Algebra" } },
  { id: "s-stats", slug: "statistics", category: "math", name: { ar: "الإحصاء والاحتمالات", en: "Statistics & Probability" } },
  { id: "s-physics", slug: "physics", category: "science", name: { ar: "الفيزياء العامة", en: "General Physics" } },
  { id: "s-chemistry", slug: "chemistry", category: "science", name: { ar: "الكيمياء العامة", en: "General Chemistry" } },
  { id: "s-biochem", slug: "biochemistry", category: "science", name: { ar: "الكيمياء الحيوية", en: "Biochemistry" } },
  { id: "s-biology", slug: "cell-biology", category: "science", name: { ar: "البيولوجيا الخلوية", en: "Cell Biology" } },
  { id: "s-electronics", slug: "electronics", category: "engineering", name: { ar: "الإلكترونيات", en: "Electronics" } },
  { id: "s-mechanics", slug: "mechanics", category: "engineering", name: { ar: "الميكانيكا", en: "Mechanics" } },
  { id: "s-thermo", slug: "thermodynamics", category: "engineering", name: { ar: "الديناميكا الحرارية", en: "Thermodynamics" } },
  { id: "s-anatomy", slug: "anatomy", category: "medicine", name: { ar: "التشريح", en: "Anatomy" } },
  { id: "s-physiology", slug: "physiology", category: "medicine", name: { ar: "علم وظائف الأعضاء", en: "Physiology" } },
  { id: "s-pharma", slug: "pharmacology", category: "medicine", name: { ar: "علم الأدوية", en: "Pharmacology" } },
  { id: "s-python", slug: "python", category: "it", name: { ar: "البرمجة بلغة بايثون", en: "Python Programming" } },
  { id: "s-dsa", slug: "data-structures", category: "it", name: { ar: "هياكل البيانات والخوارزميات", en: "Data Structures & Algorithms" } },
  { id: "s-databases", slug: "databases", category: "it", name: { ar: "قواعد البيانات", en: "Databases" } },
  { id: "s-accounting", slug: "accounting", category: "business", name: { ar: "المحاسبة العامة", en: "Financial Accounting" } },
  { id: "s-economics", slug: "microeconomics", category: "business", name: { ar: "الاقتصاد الجزئي", en: "Microeconomics" } },
  { id: "s-finance", slug: "finance", category: "business", name: { ar: "المالية", en: "Corporate Finance" } },
  { id: "s-english", slug: "academic-english", category: "languages", name: { ar: "الإنجليزية الأكاديمية", en: "Academic English" } },
  { id: "s-french", slug: "french", category: "languages", name: { ar: "الفرنسية", en: "French" } },
  { id: "s-civil-law", slug: "civil-law", category: "law", name: { ar: "القانون المدني", en: "Civil Law" } },
  { id: "s-const-law", slug: "constitutional-law", category: "law", name: { ar: "القانون الدستوري", en: "Constitutional Law" } },
];

// ─── Availability patterns ──────────────────────────────────────────────────

const weekdays = (days: number[], start: string, end: string): AvailabilityWindow[] =>
  days.map((weekday) => ({ weekday, start, end }));

const AVAILABILITY = {
  evenings: [...weekdays([1, 2, 3, 4, 5], "17:00", "21:00"), ...weekdays([6], "10:00", "14:00")],
  afternoons: [...weekdays([1, 3, 5], "14:00", "20:00"), ...weekdays([0], "10:00", "13:00")],
  everyNight: weekdays([0, 1, 2, 3, 4, 5, 6], "18:00", "22:00"),
  split: [
    ...weekdays([2, 4], "09:00", "12:00"),
    ...weekdays([2, 4], "16:00", "19:00"),
    ...weekdays([6, 0], "09:00", "13:00"),
  ],
  weekend: [...weekdays([5], "15:00", "21:00"), ...weekdays([6, 0], "09:00", "18:00")],
};

// ─── Tutors ─────────────────────────────────────────────────────────────────

interface TutorSeed {
  key: string;
  name: LocalizedText;
  hue: number;
  headline: LocalizedText;
  bio: LocalizedText;
  university: LocalizedText;
  city: LocalizedText;
  subjectIds: string[];
  languages: TutorProfile["languages"];
  modes: TutorProfile["modes"];
  rate: number;
  years: number;
  rating: number;
  reviews: number;
  lessons: number;
  response: number;
  verification: TutorProfile["verification"];
  instantBook: boolean;
  availability: AvailabilityWindow[];
}

const CITY = {
  tripoli: { ar: "طرابلس", en: "Tripoli" },
  benghazi: { ar: "بنغازي", en: "Benghazi" },
  misrata: { ar: "مصراتة", en: "Misrata" },
  zawiya: { ar: "الزاوية", en: "Zawiya" },
  sabha: { ar: "سبها", en: "Sabha" },
  bayda: { ar: "البيضاء", en: "Bayda" },
};

const tutorSeeds: TutorSeed[] = [
  {
    key: "youssef",
    name: { ar: "يوسف التاجوري", en: "Youssef Al-Tajouri" },
    hue: 248,
    headline: { ar: "دكتوراه في الرياضيات التطبيقية", en: "PhD candidate, Applied Mathematics" },
    bio: {
      ar: "أدرّس التحليل والجبر لطلبة السنة الأولى والثانية منذ خمس سنوات. أبدأ دائمًا من الفهم قبل الحفظ، وأحضّر معك تمارين الامتحانات السابقة خطوة بخطوة.",
      en: "I've taught calculus and algebra to first- and second-year students for five years. I always start with understanding before memorising, and we work through past exam problems step by step.",
    },
    university: { ar: "كلية العلوم — جامعة تجريبية", en: "Faculty of Sciences — Demo University" },
    city: CITY.tripoli,
    subjectIds: ["s-calculus", "s-algebra", "s-stats"],
    languages: ["ar", "libyan", "fr"],
    modes: ["online", "in_person"],
    rate: 45,
    years: 5,
    rating: 4.9,
    reviews: 128,
    lessons: 640,
    response: 15,
    verification: "verified",
    instantBook: false,
    availability: AVAILABILITY.evenings,
  },
  {
    key: "salma",
    name: { ar: "سلمى الفيتوري", en: "Salma Al-Fitouri" },
    hue: 330,
    headline: { ar: "طبيبة مقيمة — التشريح ووظائف الأعضاء", en: "Resident doctor — Anatomy & Physiology" },
    bio: {
      ar: "أساعد طلبة الطب في السنوات الأولى على فهم التشريح بالرسومات والخرائط الذهنية، مع أسئلة تدريبية على نمط الامتحانات.",
      en: "I help early-year medical students understand anatomy with diagrams and mind maps, plus practice questions in the exam format.",
    },
    university: { ar: "كلية الطب والصيدلة — جامعة تجريبية", en: "Faculty of Medicine — Demo University" },
    city: CITY.benghazi,
    subjectIds: ["s-anatomy", "s-physiology", "s-biology"],
    languages: ["ar", "fr", "libyan"],
    modes: ["online", "in_person"],
    rate: 60,
    years: 3,
    rating: 4.8,
    reviews: 86,
    lessons: 310,
    response: 30,
    verification: "verified",
    instantBook: true,
    availability: AVAILABILITY.weekend,
  },
  {
    key: "amine",
    name: { ar: "أمين الترهوني", en: "Amin Al-Tarhouni" },
    hue: 200,
    headline: { ar: "مهندس برمجيات — بايثون والخوارزميات", en: "Software engineer — Python & algorithms" },
    bio: {
      ar: "مهندس برمجيات وأعمل مع طلبة تقنية المعلومات على المشاريع والخوارزميات. دروسي عملية: نكتب الكود معًا ونحلل الأخطاء.",
      en: "Software engineer working with CS students on projects and algorithms. My lessons are hands-on: we write code together and debug it.",
    },
    university: { ar: "كلية تقنية المعلومات — جامعة تجريبية", en: "Faculty of Information Technology — Demo University" },
    city: CITY.tripoli,
    subjectIds: ["s-python", "s-dsa", "s-databases"],
    languages: ["ar", "en", "fr"],
    modes: ["online"],
    rate: 55,
    years: 4,
    rating: 5.0,
    reviews: 64,
    lessons: 220,
    response: 10,
    verification: "verified",
    instantBook: true,
    availability: AVAILABILITY.everyNight,
  },
  {
    key: "nour",
    name: { ar: "نور الهدى العبيدي", en: "Nour Al-Huda Al-Obeidi" },
    hue: 160,
    headline: { ar: "أستاذة إنجليزية — كتابة أكاديمية و IELTS", en: "English tutor — academic writing & IELTS" },
    bio: {
      ar: "أساعدك على كتابة تقارير وأبحاث بالإنجليزية بثقة، والتحضير لامتحانات IELTS وTOEFL.",
      en: "I'll help you write reports and research papers in English with confidence, and prepare for IELTS and TOEFL.",
    },
    university: { ar: "كلية الآداب — جامعة تجريبية", en: "Faculty of Letters — Demo University" },
    city: CITY.misrata,
    subjectIds: ["s-english"],
    languages: ["ar", "en"],
    modes: ["online", "in_person"],
    rate: 35,
    years: 6,
    rating: 4.9,
    reviews: 152,
    lessons: 780,
    response: 20,
    verification: "verified",
    instantBook: true,
    availability: AVAILABILITY.split,
  },
  {
    key: "karim",
    name: { ar: "كريم الزوي", en: "Karim Al-Zway" },
    hue: 30,
    headline: { ar: "خبير محاسب — المحاسبة والمالية", en: "Chartered accountant — accounting & finance" },
    bio: {
      ar: "أشرح المحاسبة العامة والتحليل المالي بأمثلة من الشركات الحقيقية، مع ملخصات جاهزة للمراجعة.",
      en: "I explain financial accounting and analysis with real company examples, plus ready-made revision summaries.",
    },
    university: { ar: "كلية الاقتصاد — جامعة تجريبية", en: "Faculty of Economics — Demo University" },
    city: CITY.benghazi,
    subjectIds: ["s-accounting", "s-finance", "s-economics"],
    languages: ["ar", "fr"],
    modes: ["online", "in_person"],
    rate: 40,
    years: 7,
    rating: 4.7,
    reviews: 73,
    lessons: 410,
    response: 45,
    verification: "verified",
    instantBook: false,
    availability: AVAILABILITY.afternoons,
  },
  {
    key: "imane",
    name: { ar: "إيمان المسماري", en: "Iman Al-Mismari" },
    hue: 280,
    headline: { ar: "ماستر كيمياء — الكيمياء العامة والحيوية", en: "MSc Chemistry — general & biochemistry" },
    bio: {
      ar: "أحب تبسيط الكيمياء بالتجارب والأمثلة اليومية. أركز على حل التمارين وفهم الطرق بدل الحفظ.",
      en: "I love making chemistry simple with experiments and everyday examples. I focus on solving exercises and understanding methods instead of memorising.",
    },
    university: { ar: "كلية العلوم — جامعة تجريبية", en: "Faculty of Science — Demo University" },
    city: CITY.zawiya,
    subjectIds: ["s-chemistry", "s-biochem"],
    languages: ["ar", "fr", "libyan"],
    modes: ["online", "in_person"],
    rate: 35,
    years: 2,
    rating: 4.8,
    reviews: 41,
    lessons: 150,
    response: 25,
    verification: "verified",
    instantBook: true,
    availability: AVAILABILITY.evenings,
  },
  {
    key: "hamza",
    name: { ar: "حمزة الورفلي", en: "Hamza Al-Warfalli" },
    hue: 120,
    headline: { ar: "عالم بيانات — الإحصاء وبايثون", en: "Data scientist — statistics & Python" },
    bio: {
      ar: "أربط الإحصاء والاحتمالات بتطبيقات عملية في تحليل البيانات. مناسب لطلبة الاقتصاد وتقنية المعلومات.",
      en: "I connect statistics and probability to practical data-analysis applications. Great for economics and CS students.",
    },
    university: { ar: "قسم الإحصاء — جامعة تجريبية", en: "Department of Statistics — Demo University" },
    city: CITY.tripoli,
    subjectIds: ["s-stats", "s-python", "s-calculus"],
    languages: ["ar", "en", "fr"],
    modes: ["online"],
    rate: 50,
    years: 4,
    rating: 4.9,
    reviews: 58,
    lessons: 260,
    response: 12,
    verification: "verified",
    instantBook: true,
    availability: AVAILABILITY.everyNight,
  },
  {
    key: "meriem",
    name: { ar: "مريم بن حليم", en: "Mariam Ben Halim" },
    hue: 350,
    headline: { ar: "أستاذة فرنسية — التواصل والتعبير", en: "French tutor — communication & writing" },
    bio: {
      ar: "أساعد الطلبة على تحسين الفرنسية: العروض الشفهية، كتابة التقارير، والمصطلحات التقنية.",
      en: "I help students improve university-level French: presentations, report writing and technical vocabulary.",
    },
    university: { ar: "كلية الآداب — جامعة تجريبية", en: "Faculty of Letters — Demo University" },
    city: CITY.bayda,
    subjectIds: ["s-french"],
    languages: ["ar", "fr"],
    modes: ["online", "in_person"],
    rate: 30,
    years: 5,
    rating: 4.6,
    reviews: 39,
    lessons: 205,
    response: 60,
    verification: "pending",
    instantBook: true,
    availability: AVAILABILITY.afternoons,
  },
  {
    key: "omar",
    name: { ar: "عمر الكيلاني", en: "Omar Al-Kilani" },
    hue: 15,
    headline: { ar: "باحث في القانون — المدني والدستوري", en: "Law researcher — civil & constitutional" },
    bio: {
      ar: "أساعد طلبة الحقوق على تحليل النصوص القانونية ومنهجية التعليق على القرارات والإجابة في الامتحانات.",
      en: "I help law students analyse legal texts, master case-commentary methodology and structure exam answers.",
    },
    university: { ar: "كلية القانون — جامعة تجريبية", en: "Faculty of Law — Demo University" },
    city: CITY.misrata,
    subjectIds: ["s-civil-law", "s-const-law"],
    languages: ["ar", "fr"],
    modes: ["in_person", "online"],
    rate: 45,
    years: 6,
    rating: 4.8,
    reviews: 47,
    lessons: 230,
    response: 40,
    verification: "verified",
    instantBook: false,
    availability: AVAILABILITY.split,
  },
  {
    key: "rania",
    name: { ar: "رانيا الشريف", en: "Rania Al-Sharif" },
    hue: 220,
    headline: { ar: "مهندسة — الفيزياء والإلكترونيك", en: "Engineer — physics & electronics" },
    bio: {
      ar: "أدرّس الفيزياء العامة والإلكترونيك بطريقة مرئية، مع محاكاة للدارات الكهربائية وتمارين محلولة.",
      en: "I teach general physics and electronics visually, with circuit simulations and worked exercises.",
    },
    university: { ar: "كلية الهندسة — جامعة تجريبية", en: "Faculty of Engineering — Demo University" },
    city: CITY.sabha,
    subjectIds: ["s-physics", "s-electronics"],
    languages: ["ar", "fr", "en"],
    modes: ["online"],
    rate: 40,
    years: 3,
    rating: 4.7,
    reviews: 33,
    lessons: 140,
    response: 20,
    verification: "verified",
    instantBook: true,
    availability: AVAILABILITY.evenings,
  },
  {
    key: "adam",
    name: { ar: "آدم الزنتاني", en: "Adam Al-Zintani" },
    hue: 180,
    headline: { ar: "طالب هندسة متفوق — الميكانيك والحرارة", en: "Top engineering student — mechanics & heat" },
    bio: {
      ar: "طالب في السنة الأخيرة هندسة ميكانيكية، الأول على دفعتي. أشرح لك بلغة الطلبة وبأمثلة من الامتحانات.",
      en: "Final-year mechanical engineering student, top of my class. I explain things in student language with exam examples.",
    },
    university: { ar: "كلية العلوم — جامعة تجريبية", en: "Faculty of Science — Demo University" },
    city: CITY.bayda,
    subjectIds: ["s-mechanics", "s-thermo", "s-physics"],
    languages: ["ar", "libyan", "fr"],
    modes: ["online", "in_person"],
    rate: 25,
    years: 1,
    rating: 4.9,
    reviews: 22,
    lessons: 60,
    response: 8,
    verification: "pending",
    instantBook: true,
    availability: AVAILABILITY.weekend,
  },
  {
    key: "lina",
    name: { ar: "لينا الدرسي", en: "Lina Al-Darsi" },
    hue: 300,
    headline: { ar: "صيدلانية — علم الأدوية", en: "Pharmacist — pharmacology" },
    bio: {
      ar: "أحوّل جداول الأدوية الطويلة إلى قواعد سهلة التذكر. مراجعات مكثفة قبل الامتحانات.",
      en: "I turn long drug tables into easy-to-remember rules. Intensive revision sessions before exams.",
    },
    university: { ar: "كلية الطب والصيدلة — جامعة تجريبية", en: "Faculty of Medicine — Demo University" },
    city: CITY.zawiya,
    subjectIds: ["s-pharma", "s-physiology", "s-biochem"],
    languages: ["ar", "fr"],
    modes: ["online"],
    rate: 55,
    years: 4,
    rating: 4.8,
    reviews: 51,
    lessons: 190,
    response: 35,
    verification: "verified",
    instantBook: true,
    availability: AVAILABILITY.afternoons,
  },
];

const extraStudents = [
  { key: "yassine", name: { ar: "ياسين الفرجاني", en: "Yassin Al-Farjani" }, hue: 210 },
  { key: "hajar", name: { ar: "هاجر البرعصي", en: "Hajar Al-Baraasi" }, hue: 340 },
  { key: "mehdi", name: { ar: "مهدي اشتيوي", en: "Mahdi Shtewi" }, hue: 90 },
  { key: "aya", name: { ar: "آية الغرياني", en: "Aya Al-Gharyani" }, hue: 20 },
];

const reviewComments: { rating: number; comment: LocalizedText }[] = [
  { rating: 5, comment: { ar: "شرح واضح جدًا وصبور. فهمت في ساعة ما لم أفهمه في شهر!", en: "Very clear and patient. I understood in an hour what I hadn't in a month!" } },
  { rating: 5, comment: { ar: "حضّرني للامتحان بتمارين مشابهة تمامًا. نجحت بامتياز 🙏", en: "Prepared me with exercises just like the exam. Passed with distinction 🙏" } },
  { rating: 4, comment: { ar: "درس مفيد ومنظم، أتمنى لو كان أطول قليلًا.", en: "Useful and well organised lesson, wish it was a bit longer." } },
  { rating: 5, comment: { ar: "أفضل أستاذ تعاملت معه، يعطي ملخصات رائعة بعد كل حصة.", en: "Best tutor I've had — great summaries after every session." } },
  { rating: 5, comment: { ar: "يشرح باللهجة الليبية والفصحى حسب الحاجة، وهذا ساعدني كثيرًا.", en: "Explains in Libyan dialect or standard Arabic as needed, which helped me a lot." } },
  { rating: 4, comment: { ar: "ممتاز في الشرح، ويرد بسرعة على الرسائل.", en: "Excellent explanations and replies quickly to messages." } },
];

// ─── Builders ───────────────────────────────────────────────────────────────

export function createSeed(now = new Date()): MockState {
  const iso = (d: Date) => d.toISOString();
  const at = (days: number, hour: number, minute = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, minute);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const created = iso(at(-90, 10));

  const users: MockUser[] = [
    {
      id: "u-sara",
      email: DEMO_STUDENT_EMAIL,
      password: DEMO_PASSWORD,
      role: "student",
      displayName: { ar: "سارة بالخير", en: "Sara Belkheir" },
      avatarHue: 265,
      preferredLocale: "ar",
      createdAt: created,
      isDemo: true,
    },
    ...extraStudents.map<MockUser>((s) => ({
      id: `u-${s.key}`,
      email: `${s.key}@demo.naqraw`,
      password: DEMO_PASSWORD,
      role: "student",
      displayName: s.name,
      avatarHue: s.hue,
      preferredLocale: "ar",
      createdAt: created,
      isDemo: true,
    })),
    ...tutorSeeds.map<MockUser>((t) => ({
      id: `u-${t.key}`,
      email: `${t.key}@demo.naqraw`,
      password: DEMO_PASSWORD,
      role: "tutor",
      displayName: t.name,
      avatarHue: t.hue,
      preferredLocale: "ar",
      createdAt: created,
      isDemo: true,
    })),
  ];

  const students: StudentProfile[] = [
    {
      id: "sp-sara",
      userId: "u-sara",
      university: { ar: "كلية العلوم — جامعة تجريبية", en: "Faculty of Sciences — Demo University" },
      major: { ar: "علوم الحاسوب", en: "Computer Science" },
      studyYear: 2,
      createdAt: created,
      isDemo: true,
    },
    ...extraStudents.map<StudentProfile>((s, i) => ({
      id: `sp-${s.key}`,
      userId: `u-${s.key}`,
      university: { ar: "جامعة تجريبية", en: "Demo University" },
      major: { ar: "الرياضيات", en: "Mathematics" },
      studyYear: 1 + (i % 3),
      createdAt: created,
      isDemo: true,
    })),
  ];

  const tutors: TutorProfile[] = tutorSeeds.map((t) => ({
    id: `t-${t.key}`,
    userId: `u-${t.key}`,
    displayName: t.name,
    avatarHue: t.hue,
    headline: t.headline,
    bio: t.bio,
    university: t.university,
    city: t.city,
    subjectIds: t.subjectIds,
    languages: t.languages,
    modes: t.modes,
    hourlyRate: money(t.rate),
    yearsExperience: t.years,
    rating: t.rating,
    reviewCount: t.reviews,
    lessonsCompleted: t.lessons,
    responseTimeMinutes: t.response,
    verification: t.verification,
    instantBook: t.instantBook,
    availability: t.availability,
    timezone: "Africa/Tripoli",
    createdAt: created,
    isDemo: true,
  }));

  const reviewers = [
    { name: { ar: "ياسين", en: "Yassin" }, hue: 210, id: "u-yassine" },
    { name: { ar: "هاجر", en: "Hajar" }, hue: 340, id: "u-hajar" },
    { name: { ar: "مهدي", en: "Mahdi" }, hue: 90, id: "u-mehdi" },
    { name: { ar: "آية", en: "Aya" }, hue: 20, id: "u-aya" },
  ];

  const reviews: Review[] = tutors.flatMap((tutor, ti) =>
    [0, 1, 2, 3].map((ri) => {
      const c = reviewComments[(ti + ri) % reviewComments.length];
      const r = reviewers[(ti + ri) % reviewers.length];
      return {
        id: `r-${tutor.id}-${ri}`,
        tutorId: tutor.id,
        studentId: r.id,
        authorName: r.name,
        authorHue: r.hue,
        rating: c.rating,
        comment: c.comment,
        subjectId: tutor.subjectIds[ri % tutor.subjectIds.length],
        createdAt: iso(at(-(ri * 9 + ti + 2), 19)),
        isDemo: true,
      };
    }),
  );

  const tutorById = (id: string) => tutors.find((t) => t.id === id)!;
  const booking = (
    id: string,
    studentId: string,
    tutorId: string,
    subjectId: string,
    startsAt: Date,
    status: Booking["status"],
    extra: Partial<Booking> = {},
  ): Booking => {
    const tutor = tutorById(tutorId);
    const durationMinutes = extra.durationMinutes ?? 60;
    const mode = extra.mode ?? tutor.modes[0];
    return {
      id,
      studentId,
      tutorId,
      subjectId,
      startsAt: iso(startsAt),
      durationMinutes,
      mode,
      status,
      price: priceForDuration(tutor.hourlyRate, durationMinutes),
      paymentStatus: status === "completed" || status === "confirmed" ? "simulated" : "unpaid",
      meetingUrl: mode === "online" ? `https://meet.naqraw.example/demo-${id}` : undefined,
      location: mode === "in_person" ? { ar: "مكتبة الكلية — القاعة 3", en: "Faculty library — Room 3" } : undefined,
      createdAt: iso(ago(60 * 24 * 3)),
      updatedAt: iso(ago(60 * 24 * 2)),
      isDemo: true,
      ...extra,
    };
  };

  const bookings: Booking[] = [
    // Sara (demo student)
    booking("b-1", "u-sara", "t-amine", "s-dsa", at(2, 19), "confirmed", { note: "عندي مشروع حول الأشجار الثنائية" }),
    booking("b-2", "u-sara", "t-youssef", "s-calculus", at(3, 18), "pending", {
      note: "أحتاج مراجعة التكاملات قبل الامتحان",
      mode: "in_person",
      createdAt: iso(ago(40)),
    }),
    booking("b-3", "u-sara", "t-salma", "s-biology", at(-6, 11), "completed"),
    booking("b-4", "u-sara", "t-hamza", "s-stats", at(-14, 20), "completed", { reviewId: "r-sara-hamza" }),
    // Youssef (demo tutor) — other students
    booking("b-5", "u-yassine", "t-youssef", "s-algebra", at(1, 18), "confirmed", { mode: "online" }),
    booking("b-6", "u-hajar", "t-youssef", "s-stats", at(4, 17), "pending", {
      note: "Can we focus on hypothesis testing?",
      mode: "online",
      createdAt: iso(ago(120)),
    }),
    booking("b-7", "u-mehdi", "t-youssef", "s-calculus", at(5, 19), "confirmed", { durationMinutes: 90 }),
    booking("b-8", "u-aya", "t-youssef", "s-calculus", at(-2, 18), "completed"),
    booking("b-9", "u-yassine", "t-youssef", "s-algebra", at(-4, 19), "completed"),
    booking("b-10", "u-hajar", "t-youssef", "s-stats", at(-9, 17), "completed", { durationMinutes: 90 }),
    booking("b-11", "u-mehdi", "t-youssef", "s-calculus", at(-12, 18), "completed"),
    booking("b-12", "u-aya", "t-youssef", "s-algebra", at(-1, 20), "completed"),
    booking("b-13", "u-yassine", "t-youssef", "s-calculus", at(-36, 18), "completed"),
    booking("b-14", "u-hajar", "t-youssef", "s-stats", at(-40, 19), "completed"),
  ];

  reviews.push({
    id: "r-sara-hamza",
    tutorId: "t-hamza",
    studentId: "u-sara",
    bookingId: "b-4",
    authorName: { ar: "سارة", en: "Sara" },
    authorHue: 265,
    rating: 5,
    comment: { ar: "شرح الاحتمالات بأمثلة رائعة، شكرًا!", en: "Explained probability with great examples, thanks!" },
    subjectId: "s-stats",
    createdAt: iso(at(-13, 21)),
    isDemo: true,
  });

  const conversations: Conversation[] = [
    { id: "c-1", studentId: "u-sara", tutorUserId: "u-amine", tutorId: "t-amine", lastMessageAt: iso(ago(25)), lastMessagePreview: "", createdAt: iso(ago(60 * 24 * 4)), isDemo: true },
    { id: "c-2", studentId: "u-sara", tutorUserId: "u-salma", tutorId: "t-salma", lastMessageAt: iso(ago(60 * 26)), lastMessagePreview: "", createdAt: iso(ago(60 * 24 * 8)), isDemo: true },
    { id: "c-3", studentId: "u-sara", tutorUserId: "u-youssef", tutorId: "t-youssef", lastMessageAt: iso(ago(38)), lastMessagePreview: "", createdAt: iso(ago(60)), isDemo: true },
    { id: "c-4", studentId: "u-yassine", tutorUserId: "u-youssef", tutorId: "t-youssef", lastMessageAt: iso(ago(90)), lastMessagePreview: "", createdAt: iso(ago(60 * 24 * 10)), isDemo: true },
    { id: "c-5", studentId: "u-hajar", tutorUserId: "u-youssef", tutorId: "t-youssef", lastMessageAt: iso(ago(115)), lastMessagePreview: "", createdAt: iso(ago(60 * 24 * 2)), isDemo: true },
  ];

  let messageSeq = 0;
  const msg = (conversationId: string, senderId: string, body: string, minutesAgo: number, read = true): Message => ({
    id: `m-seed-${++messageSeq}`,
    conversationId,
    senderId,
    body,
    createdAt: iso(ago(minutesAgo)),
    readAt: read ? iso(ago(Math.max(minutesAgo - 1, 0))) : undefined,
    isDemo: true,
  });

  const messages: Message[] = [
    msg("c-1", "u-sara", "مرحبًا أستاذ أمين، عندي مشروع حول الأشجار الثنائية في هياكل البيانات", 60 * 24 * 4),
    msg("c-1", "u-amine", "أهلًا سارة! بكل سرور، أرسلي لي نص المشروع وسنبدأ منه في الحصة 👍", 60 * 24 * 4 - 12),
    msg("c-1", "u-sara", "تم، حجزت حصة يوم الخميس", 60 * 24 * 3),
    msg("c-1", "u-amine", "ممتاز! حضّري حاسوبك وثبّتي Python 3.12 قبل الحصة", 25, false),
    msg("c-2", "u-salma", "كيف كانت المراجعة؟ هل تحتاجين ملخص الخلية؟", 60 * 26 + 5),
    msg("c-2", "u-sara", "نعم من فضلك، شكرًا جزيلًا!", 60 * 26),
    msg("c-3", "u-sara", "السلام عليكم، أرسلت لك طلب حجز ليوم الأحد. هل يناسبك؟", 38),
    msg("c-4", "u-yassine", "شكرًا على حصة البارح، كانت واضحة برشا!", 120),
    msg("c-4", "u-youssef", "العفو يا ياسين، ما تنساش التمارين 4 و5", 100),
    msg("c-4", "u-yassine", "نقدر نزيد حصة يوم السبت؟", 90, false),
    msg("c-5", "u-hajar", "Hi! I sent a booking request for statistics, hope that works for you.", 115, false),
  ];

  for (const c of conversations) {
    const last = messages.filter((m) => m.conversationId === c.id).at(-1);
    if (last) {
      c.lastMessagePreview = last.body;
      c.lastMessageAt = last.createdAt;
      c.lastMessageSenderId = last.senderId;
    }
  }

  const notifications: AppNotification[] = [
    { id: "n-1", userId: "u-sara", type: "booking_confirmed", data: { name: tutorById("t-amine").displayName, subject: subjects.find((s) => s.id === "s-dsa")!.name, bookingId: "b-1" }, createdAt: iso(ago(60 * 24 * 2)), isDemo: true },
    { id: "n-2", userId: "u-sara", type: "new_message", data: { name: tutorById("t-amine").displayName, conversationId: "c-1" }, createdAt: iso(ago(25)), isDemo: true },
    { id: "n-3", userId: "u-sara", type: "welcome", data: {}, createdAt: iso(ago(60 * 24 * 30)), readAt: iso(ago(60 * 24 * 29)), isDemo: true },
    { id: "n-4", userId: "u-youssef", type: "booking_requested", data: { name: { ar: "سارة بالخير", en: "Sara Belkheir" }, subject: subjects[0].name, bookingId: "b-2" }, createdAt: iso(ago(40)), isDemo: true },
    { id: "n-5", userId: "u-youssef", type: "booking_requested", data: { name: extraStudents[1].name, subject: subjects[2].name, bookingId: "b-6" }, createdAt: iso(ago(120)), isDemo: true },
    { id: "n-6", userId: "u-youssef", type: "review_received", data: { name: extraStudents[3].name, subject: subjects[0].name }, createdAt: iso(ago(60 * 20)), readAt: iso(ago(60 * 19)), isDemo: true },
  ];

  return {
    version: MOCK_STATE_VERSION,
    seededAt: iso(now),
    sessionUserId: null,
    users,
    students,
    tutors,
    subjects,
    reviews,
    favorites: [
      { userId: "u-sara", tutorId: "t-amine" },
      { userId: "u-sara", tutorId: "t-salma" },
    ],
    bookings,
    conversations,
    messages,
    notifications,
    profileViews: { "t-youssef": 342 },
  };
}
