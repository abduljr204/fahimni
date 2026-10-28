import type { Locale } from "@/domain/types";

/**
 * DRAFT legal texts written for this app's actual rules (pricing, refunds, contact
 * protection, parents, verification, video). They are a starting point for a lawyer,
 * not legal advice, and must be reviewed against Libyan law before launch.
 */

export type LegalDoc = "terms" | "privacy" | "refunds";
export const LEGAL_DOCS: LegalDoc[] = ["terms", "privacy", "refunds"];
export const LEGAL_UPDATED = "2026-10-28";

type Section = { heading: string; body: string[] };

export const LEGAL: Record<LegalDoc, Record<Locale, Section[]>> = {
  terms: {
    en: [
      { heading: "1. About Fahimni", body: ["Fahimni is a marketplace that connects students with independent tutors for private lessons, online or in person. Tutors are not employees of Fahimni; they set their own prices within the limits Fahimni publishes."] },
      { heading: "2. Accounts", body: ["You must give accurate information and keep your password private. One person, one account.", "Students under 18 cannot open their own account. A parent or legal guardian registers them, manages bookings and messages, and accepts these terms on their behalf."] },
      { heading: "3. Tutors and verification", body: ["Tutors must upload an identity document and proof of qualifications. Profiles appear to students only after Fahimni has reviewed them. Verification is a check of the documents provided, not a guarantee of teaching quality."] },
      { heading: "4. Messaging before booking", body: ["Before a lesson is booked and paid, messages are for learning needs only. Sharing phone numbers, emails, social media accounts, links, exact addresses, or arranging payment outside Fahimni is not allowed and may be blocked automatically.", "After a confirmed, paid booking, the student and tutor may share contact and meeting details."] },
      { heading: "5. Prices, commission and payment", body: ["The lesson price shown at checkout is the total the student pays. It includes Fahimni's commission; there are no hidden fees.", "Online lessons are paid in full through Fahimni. For in-person lessons, Fahimni may offer paying only the platform fee in the app and the rest in cash to the tutor at the lesson.", "Agreed prices don't change after booking, even if the tutor later changes their rate."] },
      { heading: "6. Cancellations and refunds", body: ["Cancellations and refunds follow the Cancellation & refund policy, which is shown before every payment."] },
      { heading: "7. Online classroom", body: ["Online lessons take place in Fahimni's private classroom. Only the booked student, their parent and the tutor can join. Lessons are not recorded."] },
      { heading: "8. Conduct", body: ["Be respectful. Harassment, discrimination, inappropriate content, fake profiles and attempts to avoid Fahimni's fees are not allowed. You can report a message, a person or a lesson problem at any time.", "Fahimni may warn, suspend or remove accounts that break these rules, and may hide tutor profiles."] },
      { heading: "9. Liability", body: ["Tutors are responsible for the lessons they give. Fahimni provides the platform, payments and dispute handling, and is not responsible for the content of lessons or for arrangements made outside the platform."] },
      { heading: "10. Changes and contact", body: ["We may update these terms and will tell you about important changes in the app. Questions: the support email shown in the app."] },
    ],
    ar: [
      { heading: "1. عن فهمني", body: ["فهمني منصة تربط الطلبة بأساتذة مستقلين لدروس خصوصية عن بُعد أو حضوريًا. الأساتذة ليسوا موظفين لدى فهمني، ويحددون أسعارهم ضمن الحدود التي تعلنها المنصة."] },
      { heading: "2. الحسابات", body: ["يجب تقديم معلومات صحيحة والحفاظ على سرية كلمة المرور. حساب واحد لكل شخص.", "لا يمكن للطلبة دون 18 سنة فتح حساب بأنفسهم. يسجّلهم ولي الأمر أو الوصي القانوني، ويدير الحجوزات والرسائل، ويوافق على هذه الشروط نيابة عنهم."] },
      { heading: "3. الأساتذة والتحقق", body: ["على الأستاذ رفع وثيقة هوية وما يثبت مؤهلاته. لا يظهر الملف للطلبة إلا بعد مراجعة فهمني له. التحقق فحص للمستندات المقدمة وليس ضمانًا لجودة التدريس."] },
      { heading: "4. المراسلة قبل الحجز", body: ["قبل حجز الدرس ودفعه، تقتصر الرسائل على الاحتياجات التعليمية. لا يُسمح بمشاركة أرقام الهواتف أو البريد أو حسابات التواصل أو الروابط أو العناوين الدقيقة أو الاتفاق على الدفع خارج فهمني، وقد يُحجب ذلك تلقائيًا.", "بعد حجز مؤكد ومدفوع، يمكن للطالب والأستاذ مشاركة بيانات التواصل وتفاصيل اللقاء."] },
      { heading: "5. الأسعار والعمولة والدفع", body: ["السعر المعروض عند الدفع هو المجموع الذي يدفعه الطالب، ويشمل عمولة فهمني دون أي رسوم خفية.", "تُدفع الدروس عن بُعد كاملة عبر فهمني. للدروس الحضورية قد يتيح فهمني دفع رسوم المنصة فقط عبر التطبيق والباقي نقدًا للأستاذ في الدرس.", "لا تتغير الأسعار المتفق عليها بعد الحجز حتى لو غيّر الأستاذ سعره لاحقًا."] },
      { heading: "6. الإلغاء والاسترجاع", body: ["يخضع الإلغاء والاسترجاع لسياسة الإلغاء والاسترجاع المعروضة قبل كل عملية دفع."] },
      { heading: "7. الفصل الافتراضي", body: ["تُعقد الدروس عن بُعد في فصل فهمني الخاص. يدخله فقط الطالب المحجوز له وولي أمره والأستاذ. الدروس غير مسجّلة."] },
      { heading: "8. السلوك", body: ["احترم الآخرين. لا يُسمح بالمضايقة أو التمييز أو المحتوى غير اللائق أو الملفات المزيفة أو محاولات التهرب من رسوم فهمني. يمكنك الإبلاغ عن رسالة أو شخص أو مشكلة في درس في أي وقت.", "يحق لفهمني تحذير الحسابات المخالفة أو إيقافها أو حذفها، وإخفاء ملفات الأساتذة."] },
      { heading: "9. المسؤولية", body: ["الأستاذ مسؤول عن الدروس التي يقدمها. يوفر فهمني المنصة والمدفوعات ومعالجة النزاعات، ولا يتحمل مسؤولية محتوى الدروس أو الاتفاقات التي تتم خارج المنصة."] },
      { heading: "10. التعديلات والتواصل", body: ["قد نحدّث هذه الشروط وسنخبرك بالتغييرات المهمة داخل التطبيق. للاستفسار: بريد الدعم المعروض في التطبيق."] },
    ],
  },
  privacy: {
    en: [
      { heading: "What we collect", body: ["Account details (name, email, password stored securely), optional mobile number for SMS reminders, year of birth for the age check, study details, tutor profiles and verification documents, bookings, payments, messages and files you send, and reports."] },
      { heading: "Why we use it", body: ["To run your account and lessons, process payments and refunds, send the notifications you choose, keep the platform safe (including automatic checks of pre-booking messages for contact details), and handle reports and disputes."] },
      { heading: "Who can see what", body: ["Tutors' public profiles are visible to everyone. Your phone number is never shown to other users. Conversations are visible only to the people in them (and a student's parent). Verification documents are seen only by Fahimni's verification team.", "Admins see reported messages and dispute details only when a report is made."] },
      { heading: "Video lessons", body: ["Video and audio pass through our video provider to connect the call. Lessons are not recorded."] },
      { heading: "Service providers", body: ["We use providers for hosting and database, payments, video, email and SMS. They process data only to provide those services to us."] },
      { heading: "How long we keep it", body: ["Verification documents: deleted 90 days after review. Messages: kept while your account exists. Bookings and payments: kept as required for accounting, in anonymised form after account deletion."] },
      { heading: "Your choices", body: ["You can edit your details, change notification preferences and delete your account in Account settings. Deleting removes your personal data; it is refused while you have upcoming paid lessons."] },
      { heading: "Children", body: ["Students under 18 are registered and managed by a parent or guardian, who controls their data."] },
    ],
    ar: [
      { heading: "ما نجمعه", body: ["بيانات الحساب (الاسم والبريد وكلمة المرور محفوظة بأمان)، رقم الهاتف الاختياري لتذكيرات الرسائل القصيرة، سنة الميلاد للتحقق من العمر، البيانات الدراسية، ملفات الأساتذة ومستندات التحقق، الحجوزات والمدفوعات، الرسائل والملفات المرسلة، والبلاغات."] },
      { heading: "لماذا نستخدمها", body: ["لتشغيل حسابك ودروسك، ومعالجة المدفوعات والاسترجاع، وإرسال الإشعارات التي تختارها، والحفاظ على أمان المنصة (بما في ذلك الفحص التلقائي لرسائل ما قبل الحجز بحثًا عن بيانات التواصل)، ومعالجة البلاغات والنزاعات."] },
      { heading: "من يرى ماذا", body: ["ملفات الأساتذة العامة ظاهرة للجميع. رقم هاتفك لا يظهر للمستخدمين الآخرين أبدًا. المحادثات يراها أطرافها فقط (وولي أمر الطالب). مستندات التحقق يطّلع عليها فريق التحقق في فهمني فقط.", "لا يرى المسؤولون الرسائل المبلّغ عنها وتفاصيل النزاعات إلا عند تقديم بلاغ."] },
      { heading: "الدروس المرئية", body: ["يمر الصوت والصورة عبر مزود خدمة الفيديو لربط المكالمة. الدروس غير مسجّلة."] },
      { heading: "مزودو الخدمة", body: ["نستخدم مزودين للاستضافة وقاعدة البيانات والمدفوعات والفيديو والبريد والرسائل القصيرة، ويعالجون البيانات فقط لتقديم هذه الخدمات لنا."] },
      { heading: "مدة الاحتفاظ", body: ["مستندات التحقق: تُحذف بعد 90 يومًا من المراجعة. الرسائل: ما دام حسابك قائمًا. الحجوزات والمدفوعات: بالقدر المطلوب للمحاسبة، وبشكل مجهول الهوية بعد حذف الحساب."] },
      { heading: "خياراتك", body: ["يمكنك تعديل بياناتك وتفضيلات الإشعارات وحذف حسابك من إعدادات الحساب. الحذف يزيل بياناتك الشخصية، ولا يُسمح به ما دامت لديك دروس مدفوعة قادمة."] },
      { heading: "الأطفال", body: ["الطلبة دون 18 سنة يسجّلهم ويديرهم ولي الأمر أو الوصي، وهو من يتحكم في بياناتهم."] },
    ],
  },
  refunds: {
    en: [
      { heading: "What can be refunded", body: ["Only the amount paid in the app can be refunded. For in-person lessons paid with a deposit, the cash part is paid only at the lesson, so nothing is owed if the lesson doesn't happen."] },
      { heading: "If the tutor declines or cancels", body: ["Full refund of the amount paid in the app, at any time."] },
      { heading: "If you cancel 12 hours or more before the lesson", body: ["Full refund of the amount paid in the app."] },
      { heading: "If you cancel less than 12 hours before the lesson", body: ["The platform fee (Fahimni's commission) is kept and the rest of the in-app payment is refunded. With the deposit option, the deposit is the platform fee, so nothing is refunded."] },
      { heading: "Problems with a lesson", body: ["If the tutor didn't show up, the lesson wasn't as agreed or you were charged incorrectly, report a problem from the lesson in My lessons, from the lesson time until 14 days after. Fahimni reviews it and may refund all or part of the payment."] },
      { heading: "How refunds are paid", body: ["Refunds go back to the original payment method. Timing depends on the payment provider."] },
    ],
    ar: [
      { heading: "ما الذي يمكن استرجاعه", body: ["يمكن استرجاع المبلغ المدفوع عبر التطبيق فقط. في الدروس الحضورية المدفوعة بعربون، يُدفع الجزء النقدي في الدرس فقط، فلا يُستحق شيء إذا لم يُعقد الدرس."] },
      { heading: "إذا رفض الأستاذ أو ألغى", body: ["استرجاع كامل للمبلغ المدفوع عبر التطبيق في أي وقت."] },
      { heading: "إذا ألغيت قبل الدرس بـ12 ساعة أو أكثر", body: ["استرجاع كامل للمبلغ المدفوع عبر التطبيق."] },
      { heading: "إذا ألغيت قبل الدرس بأقل من 12 ساعة", body: ["تُحتفظ برسوم المنصة (عمولة فهمني) ويُسترجع باقي المبلغ المدفوع عبر التطبيق. مع خيار العربون، العربون هو رسوم المنصة فلا يُسترجع شيء."] },
      { heading: "مشاكل في الدرس", body: ["إذا لم يحضر الأستاذ أو لم يكن الدرس كما اتُفق أو خُصم مبلغ خاطئ، أبلغ عن مشكلة من الدرس في «دروسي» من وقت الدرس وحتى 14 يومًا بعده. يراجعها فهمني وقد يعيد المبلغ كاملًا أو جزءًا منه."] },
      { heading: "كيف يتم الاسترجاع", body: ["يُعاد المبلغ إلى وسيلة الدفع الأصلية، ويعتمد التوقيت على مزود الدفع."] },
    ],
  },
};
