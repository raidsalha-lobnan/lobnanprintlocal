import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Send, CheckCircle, Bot, AlertTriangle } from 'lucide-react';

export const TelegramSettings: React.FC = () => {
  const { settings, updateSettings } = useAccounting();
  const [botToken, setBotToken] = useState(settings.telegramConfig?.botToken || '');
  const [defaultChatId, setDefaultChatId] = useState(settings.telegramConfig?.defaultChatId || '');
  const [enabled, setEnabled] = useState(settings.telegramConfig?.enabled || false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateSettings({
      telegramConfig: {
        botToken,
        defaultChatId,
        enabled,
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5 text-xs">
      <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <span>إعدادات بوت تليجرام (Telegram Bot)</span>
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-500 font-light mt-1 max-w-xl">
            قم بربط البرنامج ببوت تليجرام خاص بك لتلقي إشعارات الحركات (فواتير، سندات، إلخ) مباشرة، وللتمكن من طلب كشوفات الحساب والتقارير في أي وقت بصيغة PDF.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
        >
          {saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          <span>{saved ? 'تم الحفظ بنجاح' : 'حفظ الإعدادات'}</span>
        </button>
      </div>

      <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-3">
        <h4 className="font-bold text-blue-900">خطوات الحصول على التوكن (Bot Token):</h4>
        <ol className="list-decimal list-inside text-slate-700 space-y-1.5 font-medium">
          <li>افتح تطبيق تليجرام وابحث عن <strong className="font-mono text-blue-700">@BotFather</strong></li>
          <li>أرسل له الأمر <strong className="font-mono text-blue-700">/newbot</strong> واتبع الخطوات لاختيار اسم للبوت.</li>
          <li>بعد الانتهاء، سيعطيك رسالة تحتوي على <strong className="font-mono text-blue-700">Token</strong> (نص طويل مثل <code className="bg-white px-1 py-0.5 rounded border border-slate-200">123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code>).</li>
          <li>انسخ التوكن والصقه في الحقل أدناه.</li>
          <li>للحصول على <strong className="font-mono text-blue-700">معرف الدردشة (Chat ID)</strong>، ابدأ محادثة مع البوت الذي صنعته، وأرسل أي رسالة (مثلاً "مرحباً"). ثم ضع التوكن هنا وسيتم قراءة المعرف تلقائياً (أو يمكنك إدخاله يدوياً إذا كنت تعرفه).</li>
        </ol>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-700">التوكن (Bot Token) <span className="text-rose-500">*</span></label>
          <input
            type="text"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            className="w-full border-slate-200 rounded-lg p-2 text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
            placeholder="مثال: 123456789:ABCdefGHIjklmNOPqrstUVWxyz"
            dir="ltr"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-700">معرف الدردشة (Chat ID) <span className="text-slate-400 font-light">(اختياري للإرسال الافتراضي)</span></label>
          <input
            type="text"
            value={defaultChatId}
            onChange={(e) => setDefaultChatId(e.target.value)}
            className="w-full border-slate-200 rounded-lg p-2 text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
            placeholder="مثال: 123456789"
            dir="ltr"
          />
          <p className="text-[9px] text-slate-500 mt-1">اكتب "كشف حساب محمد" في تليجرام وسيتعرف البرنامج على المعرف تلقائياً ويرسله لك.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="telegram_enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
        />
        <label htmlFor="telegram_enabled" className="text-xs font-bold text-slate-800 cursor-pointer">
          تفعيل إشعارات تليجرام والاستجابة للأوامر
        </label>
      </div>

      {enabled && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[10px] sm:text-[11px] text-amber-900 leading-relaxed font-medium">
            <strong>ملاحظة هامة:</strong> بما أن البرنامج يعمل من خلال المتصفح لضمان أقصى درجات الخصوصية والأمان والسرعة، فإن البوت سيكون نشطاً ويتلقى الأوامر ويرسل الكشوفات <strong className="underline text-amber-950">طالما أن صفحة البرنامج مفتوحة في جهازك (الكمبيوتر أو الجوال)</strong>. عند إغلاق البرنامج، سيتوقف البوت عن الرد حتى تفتح البرنامج مرة أخرى.
          </div>
        </div>
      )}
    </div>
  );
};
