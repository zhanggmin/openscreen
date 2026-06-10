产品名称
DemoBuilder

一句话定位：

上传产品截图，标注热点和步骤，自动生成在线操作手册、PDF文档和带鼠标动画的视频教程。

AI开发提示词
你是一名资深全栈工程师和产品架构师。

请帮我开发一个类似 MotionShot、Supademo、Storylane 的产品演示生成平台。

产品目标
用户上传多张截图。

通过可视化方式：

标注热点区域

添加步骤说明

配置步骤跳转关系

添加字幕

添加语音

配置鼠标动画

系统自动生成：

在线交互式教程

PDF操作手册

视频教程（MP4）


核心功能
1 图片管理
支持：


上传图片

拖拽排序

批量上传

删除图片

替换图片
图片数据结构：

TypeScript

interface Screenshot {
  id:string
  url:string
  width:number
  height:number
  order:number
}
2 热点标注
用户可以：


框选区域

拖动区域

调整大小

删除区域

复制区域
热点支持：


说明文字

点击动画

鼠标目标位置

跳转步骤

高亮样式

3 步骤管理
支持：


新增步骤

删除步骤

拖动排序

步骤复制

步骤分支
例如：


步骤1

├── 点击登录
│
└── 步骤2

步骤2

├── 点击创建订单
│
└── 步骤3
4 鼠标动画系统
支持：

鼠标样式

默认箭头

手型

Mac鼠标

Windows鼠标

自定义PNG
鼠标移动
支持：


线性

缓动

贝塞尔曲线
数据结构：


鼠标点击
支持：


点击波纹

点击缩放

点击闪光
支持音效：


mouse-click.mp3
5 字幕系统
每一步可以配置：


字幕内容

出现时间

消失时间

字体

字号

位置
数据结构：

TypeScript

interface Subtitle {
  text:string

  start:number

  end:number
}
6 AI语音
支持：


输入文本

自动生成语音

试听

重新生成
数据结构：

TypeScript

interface Voice {
  text:string

  audioUrl:string

  duration:number
}
7 在线教程播放器
生成：


/demo/{id}
播放器支持：


自动播放

手动播放

下一步

上一步

全屏

目录导航
演示逻辑：


显示截图

↓

鼠标移动

↓

点击热点

↓

播放说明

↓

进入下一步
8 PDF导出
生成：


封面

目录

步骤截图

说明文字

页码
输出：


PDF
9 视频生成
使用：


Remotion
视频流程：


显示截图

↓

鼠标移动

↓

热点高亮

↓

鼠标点击

↓

播放音效

↓

显示字幕

↓

播放语音

↓

切换下一张图片
支持：


1080P

2K

4K
导出：


MP4
WebM
页面设计
Dashboard

项目列表

创建项目

删除项目
Editor
左侧：


步骤列表
中间：


图片标注画布
右侧：


属性编辑器

热点属性

字幕属性

语音属性
Preview
使用：


Remotion Player
支持：


实时预览

播放

暂停

跳转时间轴
架构要求
必须采用：


Editor
↓
Project JSON
↓
Remotion Renderer
↓
HTML
PDF
MP4
所有内容统一存储为 JSON。

Remotion 不参与编辑。

Remotion 只负责：

实时预览

视频渲染

编辑能力全部在 Editor 完成。

开发顺序
Phase 1


项目管理

图片上传

热点标注

步骤跳转

在线教程
Phase 2


鼠标动画

字幕

音效

Remotion预览
Phase 3


AI语音

PDF导出

MP4导出
Phase 4


AI自动生成步骤说明

AI自动配音

AI自动生成字幕
这个版本已经接近可以直接喂给 Claude Code / Codex 自动生成项目骨架了。

我更建议再增加一个核心能力：

导入 Figma、网页 URL、录屏视频，自动拆解成步骤和热点。

因为这会让产品从「教程编辑器」升级为「AI 产品演示生成平台」，天花板会高很多。