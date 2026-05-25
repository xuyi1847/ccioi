'use client';

export default function EmptyStateCard({
  fundsLength = 0,
  currentTab = 'all',
  onAddToGroup,
  onExportGroup,
  onImportGroup,
  onImportExcelHoldings,
}) {
  const isEmpty = fundsLength === 0;
  const isGroupTab = currentTab !== 'all' && currentTab !== 'fav';

  return (
    <div
      className="glass card empty"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: 16, opacity: 0.5 }}>📂</div>
      <div className="muted" style={{ marginBottom: 20 }}>
        {isEmpty ? '尚未添加基金' : '该分组下暂无数据'}
      </div>
      {isEmpty && !isGroupTab && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="button secondary" onClick={onImportGroup}>
              导入分组
            </button>
            <button className="button secondary" onClick={onImportExcelHoldings}>
              导入持仓文件
            </button>
          </div>
        </div>
      )}
      {isGroupTab && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="button secondary" onClick={onExportGroup}>
              导出分组
            </button>
            <button className="button secondary" onClick={onImportGroup}>
              导入分组
            </button>
            <button className="button secondary" onClick={onImportExcelHoldings}>
              导入持仓文件
            </button>
          </div>
          <button className="button" onClick={onAddToGroup}>
            添加基金到此分组
          </button>
        </div>
      )}
    </div>
  );
}
