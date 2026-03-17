'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ANNOUNCEMENT_KEY = 'hasClosedAnnouncement_v15';

export default function Announcement() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasClosed = localStorage.getItem(ANNOUNCEMENT_KEY);
    if (!hasClosed) {
      setIsVisible(true);
    }
  }, []);

  const handleClose = () => {
    // 清理历史 ANNOUNCEMENT_KEY
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('hasClosedAnnouncement_v') && key !== ANNOUNCEMENT_KEY) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    localStorage.setItem(ANNOUNCEMENT_KEY, 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            padding: '20px',
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="glass"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '24px',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: 'calc(100dvh - 40px)',
              overflow: 'hidden',
            }}
          >
            <div className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 700, fontSize: '18px', color: 'var(--accent)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>公告</span>
            </div>
            <div style={{ color: 'var(--text)', lineHeight: '1.6', fontSize: '15px', overflowY: 'auto', minHeight: 0, flex: 1, paddingRight: '4px' }}>
              <p>v0.2.4 版本更新内容如下：</p>
              <p>1. 调整设置持仓相关弹框样式。</p>
              <p>2. 基金详情弹框支持设置持仓相关参数。</p>
              <p>3. 添加基金到分组弹框展示持仓金额数据。</p>
              <p>4. 已登录用户新增手动同步按钮。</p>
              <br/>
              <p>答疑：</p>
              <p>1. 因估值数据源问题，大部分海外基金估值数据不准或没有，暂时没有解决方案。</p>
              <p>2. 因交易日用户人数过多，为控制服务器免费额度上限，暂时减少数据自动同步频率，新增手动同步按钮。</p>
              <p>如有建议，欢迎进用户支持群反馈。</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                className="button" 
                onClick={handleClose}
                style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center' }}
              >
                我知道了
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
