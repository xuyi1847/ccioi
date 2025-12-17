import React, { useState, useEffect } from 'react';
import { X, CreditCard, CheckCircle2, Loader2, Smartphone, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PACKAGES = [
  { price: 10, credits: 1000, label: 'Starter' },
  { price: 20, credits: 2500, label: 'Popular', popular: true },
  { price: 50, credits: 7000, label: 'Pro' },
  { price: 100, credits: 15000, label: 'Enterprise' },
];

type PaymentMethod = 'ALIPAY' | 'WECHAT' | 'CARD';

const AlipayIcon = () => (
  <svg viewBox="0 0 1024 1024" className="w-6 h-6 fill-blue-500" xmlns="http://www.w3.org/2000/svg"><path d="M869.5 284.4c-20.9-10.2-111.9-52.7-111.9-52.7s26.8-59.3 46.1-99.2c3.1-6.5-1.9-14-8.9-14h-172c-4.4 0-8.5 2.5-10.4 6.5-23.7 48.2-61.9 116.5-61.9 116.5H417s-22.3-91.8-24.8-102.3c-2.4-10-10.4-18.3-20.9-20.7h-189c-5.8 0-10.6 4.6-10.8 10.4-0.6 20.3 3.6 70.8 30.5 112.6h-94.5c-7 0-12.7 5.7-12.7 12.7v50.2c0 7 5.7 12.7 12.7 12.7h118.8s3.4 83.1 3.4 86.2c0 3.1-2.2 13.9-3.4 17.5-30.8 98.6-88.6 195.1-163.6 244.6-5.8 3.8-7.5 11.5-3.8 17.4l41.6 63.3c3.2 4.9 9.5 6.8 14.8 4.4 125.6-56.7 205.8-185.1 236.4-329.7h161.9c-4 15.3-25.7 89.2-25.7 89.2-27.4 82.2-96.8 126.9-195.1 127.3-6.6 0-12 5.4-12 12v63.1c0 6.6 5.4 12 12 12 254.8-2.6 357.6-157.9 400.9-281.3h-199s31.7-65.1 46.1-95.3h169.5c7 0 12.7-5.7 12.7-12.7v-49c-0.1-6.9-5.8-12.6-12.8-12.6z"/></svg>
);

const WeChatIcon = () => (
  <svg viewBox="0 0 1024 1024" className="w-6 h-6 fill-green-500" xmlns="http://www.w3.org/2000/svg"><path d="M667.6 364.2c-120.6 0-218.4 92.9-218.4 207.3 0 114.5 97.8 207.3 218.4 207.3 120.6 0 218.4-92.9 218.4-207.3 0-114.4-97.8-207.3-218.4-207.3z m-85.4 159.6c-17.1 0-31-14.8-31-33 0-18.2 13.9-33 31-33s31 14.8 31 33c0 18.2-13.9 33-31 33z m166 0c-17.1 0-31-14.8-31-33 0-18.2 13.9-33 31-33s31 14.8 31 33c0 18.2-13.9 33-31 33z"/><path d="M352.4 200C202.2 200 80.5 304.5 80.5 433.2c0 74.3 40.8 140.6 104.5 183.1 0 0-13.2 46.2-16.1 56.4-5 17.5 17.5 7.6 17.5 7.6l71.2-40.8c29.1 8 59.8 12.3 91.5 12.3 0.9 0 1.9 0 2.8 0-1.7-11.2-2.6-22.6-2.6-34.1 0-141.2 126.9-255.7 283.5-255.7 39.4 0 77 7.2 111.7 20.6C717.3 273.7 547.4 200 352.4 200z m-89.2 198c-21.1 0-38.3-18.2-38.3-40.7 0-22.4 17.1-40.7 38.3-40.7s38.3 18.2 38.3 40.7c-0.1 22.5-17.2 40.7-38.3 40.7z m204.8 0c-21.1 0-38.3-18.2-38.3-40.7 0-22.4 17.1-40.7 38.3-40.7s38.3 18.2 38.3 40.7c0 22.5-17.1 40.7-38.3 40.7z"/></svg>
);

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose }) => {
  const { recharge } = useAuth();
  const { t } = useLanguage();
  const [selectedPackage, setSelectedPackage] = useState(PACKAGES[1]);
  const [method, setMethod] = useState<PaymentMethod>('ALIPAY');
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'QR' | 'SUCCESS'>('IDLE');

  // Reset state when opening
  useEffect(() => {
    if (isOpen) setStatus('IDLE');
  }, [isOpen]);

  const handlePay = async () => {
    if (method === 'CARD') {
      setStatus('PROCESSING');
      try {
        await recharge(selectedPackage.credits);
        setStatus('SUCCESS');
      } catch (e) {
        setStatus('IDLE');
      }
    } else {
      // Simulate QR Code flow for Alipay/WeChat
      setStatus('QR');
      // Simulate user scanning and paying
      setTimeout(async () => {
        setStatus('PROCESSING');
        await recharge(selectedPackage.credits);
        setStatus('SUCCESS');
      }, 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-app-surface border border-app-border rounded-2xl shadow-2xl overflow-hidden relative animate-fade-up flex flex-col md:flex-row">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-app-subtext hover:text-app-text transition-colors z-10"
        >
          <X size={20} />
        </button>

        {/* Left Side: Package Selection */}
        <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-app-border bg-app-surface/50">
          <h3 className="text-lg font-bold text-app-text mb-4">{t('pay.select_package')}</h3>
          <div className="space-y-3">
            {PACKAGES.map((pkg) => (
              <div 
                key={pkg.price}
                onClick={() => setSelectedPackage(pkg)}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedPackage.price === pkg.price 
                    ? 'border-app-accent bg-app-accent/5' 
                    : 'border-app-border bg-app-surface hover:border-app-subtext/50'
                }`}
              >
                {pkg.popular && (
                  <span className="absolute -top-3 right-4 bg-app-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    {t('pay.best_value')}
                  </span>
                )}
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-app-text font-bold">{pkg.credits} {t('pay.credits')}</div>
                    <div className="text-app-subtext text-xs">{pkg.label}</div>
                  </div>
                  <div className="text-xl font-bold text-app-accent">${pkg.price}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Payment Method & Process */}
        <div className="flex-1 p-6 flex flex-col relative">
          
          {status === 'SUCCESS' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 animate-fade-up">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-app-text">{t('pay.success')}</h3>
                <p className="text-app-subtext">{t('pay.success_desc')}</p>
              </div>
              <button 
                onClick={onClose}
                className="bg-app-surface-hover hover:bg-app-border text-app-text px-6 py-2 rounded-lg transition-colors"
              >
                {t('pay.close')}
              </button>
            </div>
          ) : status === 'QR' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 animate-fade-up">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-app-text">{t('pay.scan')}</h3>
                <p className="text-app-subtext text-xs">{t('pay.scan_desc')}</p>
              </div>
              
              <div className="p-4 bg-white rounded-xl shadow-lg relative">
                <QrCode className="w-40 h-40 text-black" />
                <div className="absolute inset-0 flex items-center justify-center">
                   {method === 'ALIPAY' ? <AlipayIcon /> : <WeChatIcon />}
                </div>
              </div>

              <div className="flex items-center gap-2 text-app-subtext text-xs animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                Wait for payment...
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-bold text-app-text mb-4">{t('pay.method')}</h3>
              
              <div className="space-y-3 mb-6">
                 <button
                   onClick={() => setMethod('ALIPAY')}
                   className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                     method === 'ALIPAY' 
                       ? 'border-blue-500/50 bg-blue-500/10' 
                       : 'border-app-border bg-app-surface hover:bg-app-surface-hover'
                   }`}
                 >
                   <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                      <AlipayIcon />
                   </div>
                   <span className="text-app-text font-medium">Alipay</span>
                 </button>

                 <button
                   onClick={() => setMethod('WECHAT')}
                   className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                     method === 'WECHAT' 
                       ? 'border-green-500/50 bg-green-500/10' 
                       : 'border-app-border bg-app-surface hover:bg-app-surface-hover'
                   }`}
                 >
                   <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                      <WeChatIcon />
                   </div>
                   <span className="text-app-text font-medium">WeChat Pay</span>
                 </button>

                 <button
                   onClick={() => setMethod('CARD')}
                   className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                     method === 'CARD' 
                       ? 'border-app-accent bg-app-accent/10' 
                       : 'border-app-border bg-app-surface hover:bg-app-surface-hover'
                   }`}
                 >
                   <div className="w-8 h-8 rounded-lg bg-app-base flex items-center justify-center border border-app-border">
                      <CreditCard className="w-5 h-5 text-app-text" />
                   </div>
                   <span className="text-app-text font-medium">Credit Card</span>
                 </button>
              </div>

              <div className="mt-auto">
                <div className="flex justify-between items-center mb-4 text-sm">
                  <span className="text-app-subtext">{t('pay.total')}</span>
                  <span className="text-xl font-bold text-app-text">${selectedPackage.price}.00</span>
                </div>
                <button
                  onClick={handlePay}
                  disabled={status === 'PROCESSING'}
                  className="w-full bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white py-3 rounded-xl font-bold shadow-lg shadow-app-accent/20 flex items-center justify-center gap-2 transition-all"
                >
                  {status === 'PROCESSING' ? (
                    <>
                      <Loader2 className="animate-spin w-5 h-5" /> {t('pay.processing')}
                    </>
                  ) : (
                    <>
                      {t('pay.pay_now')}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default PaymentModal;