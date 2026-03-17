# localStorage 数据结构说明

本文档详细说明了 real-time-fund 项目中使用的 localStorage 数据结构。

## 概述

项目使用 localStorage 来持久化用户的基金数据、配置和状态。所有数据都以 JSON 字符串格式存储（除简单字符串外）。

---

## 数据键列表

### 1. funds

**类型**: `Array<Object>`  
**默认值**: `[]`  
**说明**: 存储用户添加的所有基金信息

**数据结构**:
```javascript
[
  {
    code: string,      // 基金代码（唯一标识）
    name: string,      // 基金名称
    type: string,      // 基金类型
    dwjz: number,      // 单位净值
    gsz: number,       // 估算净值
    gszzl: number,     // 估算涨跌幅
    jzrq: string,      // 净值日期
    gztime: string,    // 估值时间
    // ... 其他基金字段
  }
]
```

**使用场景**:
- 页面加载时恢复基金列表
- 添加/删除基金时更新
- 导入/导出配置时包含
- 云端同步时同步

---

### 2. favorites

**类型**: `Array<string>`  
**默认值**: `[]`  
**说明**: 存储用户标记为自选的基金代码列表

**数据结构**:
```javascript
[
  "000001",  // 基金代码
  "110022",
  // ...
]
```

**使用场景**:
- 显示自选基金标签页
- 添加/移除自选时更新
- 导入/导出配置时包含

---

### 3. groups

**类型**: `Array<Object>`  
**默认值**: `[]`  
**说明**: 存储用户创建的基金分组信息

**数据结构**:
```javascript
[
  {
    id: string,           // 分组唯一标识
    name: string,         // 分组名称
    codes: Array<string>  // 分组内的基金代码列表
  }
]
```

**使用场景**:
- 显示分组标签页
- 分组管理（添加、编辑、删除）
- 导入/导出配置时包含

---

### 4. collapsedCodes

**类型**: `Array<string>`  
**默认值**: `[]`  
**说明**: 存储用户收起的基金代码列表（用于折叠基金详情）

**数据结构**:
```javascript
[
  "000001",  // 收起的基金代码
  "110022",
  // ...
]
```

**使用场景**:
- 记录用户折叠的基金卡片
- 页面刷新后保持折叠状态

---

### 5. collapsedTrends

**类型**: `Array<string>`  
**默认值**: `[]`  
**说明**: 存储用户收起的业绩走势图表的基金代码列表

**数据结构**:
```javascript
[
  "000001",  // 收起走势图的基金代码
  "110022",
  // ...
]
```

**使用场景**:
- 记录用户折叠的业绩走势图表
- 页面刷新后保持折叠状态

---

### 6. viewMode

**类型**: `string`  
**默认值**: `'card'`  
**可选值**: `'card'` | `'list'`  
**说明**: 存储用户选择的视图模式

**数据结构**:
```javascript
'card'  // 卡片视图
'list'  // 列表视图
```

**使用场景**:
- 切换卡片/列表视图
- 页面刷新后保持视图模式

---

### 7. refreshMs

**类型**: `number` (字符串存储)  
**默认值**: `30000` (30秒)  
**最小值**: `5000` (5秒)  
**说明**: 存储数据刷新间隔时间（毫秒）

**数据结构**:
```javascript
'30000'  // 30秒刷新一次
'60000'  // 60秒刷新一次
```

**使用场景**:
- 控制基金数据自动刷新频率
- 用户设置刷新间隔时更新

---

### 8. holdings

**类型**: `Object`  
**默认值**: `{}`  
**说明**: 存储用户的持仓信息

**数据结构**:
```javascript
{
  "000001": {
    share: number,  // 持有份额
    cost: number    // 持仓成本价
  },
  "110022": {
    share: number,
    cost: number
  }
}
```

**使用场景**:
- 计算持仓收益
- 买入/卖出操作时更新
- 导入/导出配置时包含

---

### 9. pendingTrades

**类型**: `Array<Object>`  
**默认值**: `[]`  
**说明**: 存储待处理的交易记录（当净值未更新时）

**数据结构**:
```javascript
[
  {
    id: string,          // 交易唯一标识
    fundCode: string,    // 基金代码
    fundName: string,    // 基金名称
    type: string,        // 交易类型 'buy' | 'sell'
    share: number,       // 交易份额
    amount: number,      // 交易金额
    feeRate: number,     // 手续费率
    feeMode: string,     // 手续费模式
    feeValue: number,    // 手续费金额
    date: string,        // 交易日期
    isAfter3pm: boolean, // 是否下午3点后
    isAfter3pm: boolean, // 是否下午3点后
    timestamp: number    // 时间戳
  }
]
```

**使用场景**:
- 净值未更新时暂存交易
- 净值更新后自动处理待处理交易
- 导入/导出配置时包含

---

### 10. localUpdatedAt

**类型**: `string` (ISO 8601 格式)  
**默认值**: `null`  
**说明**: 存储本地数据最后更新时间戳，用于云端同步冲突检测

**数据结构**:
```javascript
'2024-01-15T10:30:00.000Z'
```

**使用场景**:
- 云端同步时比较数据版本
- 检测本地和云端数据冲突

---

### 11. hasClosedAnnouncement_v7

**类型**: `string`  
**默认值**: `null`  
**可选值**: `'true'`  
**说明**: 标记用户是否已关闭公告弹窗

**数据结构**:
```javascript
'true'  // 用户已关闭公告
```

**使用场景**:
- 控制公告弹窗显示
- 版本号后缀（v7）用于控制公告版本

---

## 数据同步机制

### 云端同步

项目支持通过 Supabase 进行云端数据同步：

1. **上传到云端**: 用户登录后，本地数据会自动上传到云端
2. **从云端下载**: 用户在其他设备登录时，会从云端下载数据
3. **冲突处理**: 当本地和云端数据不一致时，会提示用户选择使用哪份数据

**同步的数据字段**:
- funds
- favorites
- groups
- collapsedCodes
- collapsedTrends
- viewMode
- refreshMs
- holdings
- pendingTrades

### 导入/导出

用户可以导出配置到 JSON 文件，或从 JSON 文件导入配置：

**导出格式**:
```javascript
{
  funds: [],
  favorites: [],
  groups: [],
  collapsedCodes: [],
  refreshMs: 30000,
  viewMode: 'card',
  holdings: {},
  pendingTrades: [],
  exportedAt: '2024-01-15T10:30:00.000Z'
}
```

**导入逻辑**:
- 合并基金列表（去重）
- 合并自选、分组等配置
- 保留现有数据，避免覆盖

---

## 数据验证和清理

### 数据去重

基金列表使用 `dedupeByCode` 函数进行去重，确保每个基金代码只出现一次。

```javascript
const dedupeByCode = (list) => {
  const seen = new Set();
  return list.filter(f => {
    if (!f?.code) return false;
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });
};
```

### 数据清理

在收集数据上传云端时，会进行数据验证和清理：

1. 清理无效的持仓数据（基金不存在的持仓）
2. 清理无效的自选、分组、收起状态
3. 确保数据类型正确

---

## 存储辅助工具

项目使用 `storageHelper` 对象来封装 localStorage 操作，提供统一的错误处理和日志记录。

```javascript
const storageHelper = {
  setItem: (key, value) => { /* ... */ },
  getItem: (key) => { /* ... */ },
  removeItem: (key) => { /* ... */ },
  clear: () => { /* ... */ }
};
```

---

## 注意事项

1. **数据大小限制**: localStorage 有约 5-10MB 的存储限制，大量基金数据可能超出限制
2. **数据同步**: 修改数据后需要同时更新 localStorage 和 React state
3. **错误处理**: 所有 localStorage 操作都应包含 try-catch 错误处理
4. **数据格式**: 复杂数据必须使用 JSON.stringify/JSON.parse 进行序列化/反序列化
5. **版本控制**: 公告等配置使用版本号后缀，便于控制不同版本的显示

---

## 相关文件

- `app/page.jsx` - 主要页面组件，包含所有 localStorage 操作
- `app/components/Announcement.jsx` - 公告组件
- `app/lib/supabase.js` - Supabase 客户端配置

---

## 更新日志

- **2026-02-19**: 初始文档创建
