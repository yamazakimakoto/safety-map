const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat } = require('docx');
const fs = require('fs');
const path = require('path');

const FONT = 'Hiragino Kaku Gothic ProN';
const FONT_ALT = 'Arial';
const PRIMARY = '1A73E8';
const GRAY = '666666';
const LIGHT_BG = 'F5F7FA';
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function baseDoc(title, footerText) {
  return {
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: FONT, color: PRIMARY },
          paragraph: { spacing: { before: 300, after: 200 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: FONT, color: '333333' },
          paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 23, bold: true, font: FONT, color: '555555' },
          paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 } },
      ]
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [
          { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } }
        ]},
        { reference: 'numbers', levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
        ]},
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 }
        }
      },
      children: []
    }]
  };
}

function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }); }
function h3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }); }
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, size: 22, font: FONT, ...opts.run })]
  });
}
function bold(text) { return new TextRun({ text, bold: true, size: 22, font: FONT }); }
function bullet(text, level = 0) {
  return new Paragraph({ numbering: { reference: 'bullets', level }, spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: FONT })] });
}
function numbered(text, level = 0) {
  return new Paragraph({ numbering: { reference: 'numbers', level }, spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: FONT })] });
}
function space() { return new Paragraph({ spacing: { after: 60 }, children: [] }); }

function makeTable(headers, rows, colWidths) {
  const tw = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: tw, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: headers.map((h, i) => new TableCell({
        borders, width: { size: colWidths[i], type: WidthType.DXA }, margins: cellMargins,
        shading: { fill: PRIMARY, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20, font: FONT })] })]
      }))}),
      ...rows.map(row => new TableRow({ children: row.map((cell, i) => new TableCell({
        borders, width: { size: colWidths[i], type: WidthType.DXA }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, font: FONT })] })]
      }))}))
    ]
  });
}

// ========================================
// 1. ユーザーマニュアル
// ========================================
function createUserManual() {
  const doc = baseDoc('街の安全安心マップ - ユーザーマニュアル', '街の安全安心マップ ユーザーマニュアル');
  const children = doc.sections[0].children;

  // 表紙
  children.push(space(), space(), space(), space());
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: '街の安全安心マップ', size: 48, bold: true, font: FONT, color: PRIMARY })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [new TextRun({ text: 'ユーザーマニュアル', size: 36, font: FONT, color: '333333' })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
    children: [new TextRun({ text: '地域の安心安全情報を地図上で共有するアプリケーション', size: 22, font: FONT, color: GRAY })] }));
  children.push(space());
  children.push(new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `発行日: ${new Date().toLocaleDateString('ja-JP')}`, size: 20, font: FONT, color: GRAY })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'バージョン: 1.0', size: 20, font: FONT, color: GRAY })] }));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 目次
  children.push(h1('目次'));
  ['はじめに', 'ユーザー登録', 'ログイン・ログアウト', '地図の操作', '投稿する', '投稿を確認する', 'マイ投稿の管理', 'カテゴリーについて', '管理ステータスについて', 'よくある質問'].forEach((t, i) =>
    children.push(p(`${i + 1}. ${t}`))
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 1. はじめに
  children.push(h1('1. はじめに'));
  children.push(p('「街の安全安心マップ」は、地域の安心安全に関する気づきを地図上で投稿・共有できるWebアプリケーションです。道路の損傷、防犯灯の不具合、災害リスクなど、地域で気づいた課題を地図上にマークし、写真やメモと共に投稿できます。'));
  children.push(p('投稿された情報は地図上で誰でも閲覧でき、管理者が対応状況を更新します。スマートフォンからもパソコンからも利用できます。'));
  children.push(space());
  children.push(h2('対応ブラウザ'));
  children.push(bullet('Safari（Mac / iPhone / iPad）'));
  children.push(bullet('Google Chrome'));
  children.push(bullet('Microsoft Edge'));
  children.push(bullet('Firefox'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 2. ユーザー登録
  children.push(h1('2. ユーザー登録'));
  children.push(p('投稿するにはユーザー登録が必要です。閲覧のみであれば登録不要です。'));
  children.push(space());
  children.push(h2('登録手順'));
  children.push(numbered('画面右上の「ログイン」ボタンをクリック'));
  children.push(numbered('「新規登録」タブをクリック'));
  children.push(numbered('以下の情報を入力'));
  children.push(bullet('メールアドレス（必須）- 2回入力して一致を確認', 1));
  children.push(bullet('表示名（必須）- 投稿時に表示される名前（50文字以内）', 1));
  children.push(bullet('本名（任意）- 管理者のみ閲覧可能', 1));
  children.push(bullet('住所（任意）- 管理者のみ閲覧可能', 1));
  children.push(bullet('電話番号（任意）- 管理者のみ閲覧可能', 1));
  children.push(numbered('「登録する」ボタンをクリック'));
  children.push(space());
  children.push(p('※ メールアドレスはシステム内で暗号化して保存されます。パスワードは不要で、メールアドレスのみでログインします。', { run: { color: GRAY, size: 20 } }));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 3. ログイン
  children.push(h1('3. ログイン・ログアウト'));
  children.push(h2('ログイン'));
  children.push(numbered('画面右上の「ログイン」ボタンをクリック'));
  children.push(numbered('登録済みのメールアドレスを入力'));
  children.push(numbered('「ログイン」ボタンをクリック'));
  children.push(space());
  children.push(h2('ログアウト'));
  children.push(p('画面右上の「ログアウト」ボタンをクリックするとログアウトします。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 4. 地図の操作
  children.push(h1('4. 地図の操作'));
  children.push(p('地図はOpenStreetMapの地図データを使用しています。'));
  children.push(space());
  children.push(h2('基本操作'));
  children.push(makeTable(
    ['操作', 'パソコン', 'スマートフォン'],
    [
      ['地図の移動', 'ドラッグ', 'スワイプ'],
      ['拡大', 'スクロールアップ / +ボタン', 'ピンチアウト / +ボタン'],
      ['縮小', 'スクロールダウン / -ボタン', 'ピンチイン / -ボタン'],
      ['投稿ポイントの確認', 'マーカーをクリック', 'マーカーをタップ'],
    ],
    [2500, 3200, 3200]
  ));
  children.push(space());
  children.push(h2('カテゴリーフィルター'));
  children.push(p('画面上部のフィルターバーでカテゴリーを選択すると、そのカテゴリーの投稿のみが表示されます。「すべて」を選ぶと全カテゴリーが表示されます。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 5. 投稿する
  children.push(h1('5. 投稿する'));
  children.push(p('ログイン後、地図上をクリック（スマホではタップ）すると投稿フォームが開きます。'));
  children.push(space());
  children.push(h2('投稿手順'));
  children.push(numbered('地図上で投稿したい場所をクリック'));
  children.push(numbered('投稿フォームが表示されます'));
  children.push(numbered('カテゴリーを選択（環境・交通/道路・防犯・防災・その他）'));
  children.push(numbered('タイトルを入力（100文字以内）'));
  children.push(numbered('詳細メモを入力（任意）'));
  children.push(numbered('写真を添付（任意・最大2枚・各5MB以下）'));
  children.push(numbered('「投稿する」ボタンをクリック'));
  children.push(space());
  children.push(p('投稿すると座標から住所が自動的に設定されます。'));
  children.push(space());
  children.push(h2('写真について'));
  children.push(bullet('JPEG, PNG, GIF, WebP形式に対応'));
  children.push(bullet('1枚あたり最大5MB'));
  children.push(bullet('最大2枚まで添付可能'));
  children.push(bullet('写真は後から編集画面で追加・削除・差し替えが可能'));
  children.push(space());
  children.push(p('※ 投稿可能なエリアは設定された範囲内に限定されています。範囲外をクリックするとエラーメッセージが表示されます。', { run: { color: GRAY, size: 20 } }));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 6. 投稿を確認する
  children.push(h1('6. 投稿を確認する'));
  children.push(p('地図上のマーカーをクリックすると、投稿のポップアップが表示されます。'));
  children.push(space());
  children.push(h2('ポップアップの内容'));
  children.push(bullet('カテゴリー（色付きバッジ）'));
  children.push(bullet('管理ステータス（投稿・受付・対応中・解決）'));
  children.push(bullet('タイトル'));
  children.push(bullet('説明文（先頭100文字）'));
  children.push(bullet('写真のサムネイル'));
  children.push(bullet('投稿者名と投稿日'));
  children.push(space());
  children.push(p('「詳細を見る」ボタンで右側のサイドパネルに全情報が表示されます。住所、座標情報も確認できます。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 7. マイ投稿の管理
  children.push(h1('7. マイ投稿の管理'));
  children.push(p('ログイン後、画面右上の「マイ投稿」ボタンから自分の投稿を管理できます。'));
  children.push(space());
  children.push(h2('編集'));
  children.push(bullet('カテゴリー、タイトル、詳細メモの変更が可能'));
  children.push(bullet('既存の写真の削除が可能（写真の x ボタン）'));
  children.push(bullet('新しい写真の追加・差し替えが可能'));
  children.push(bullet('投稿場所（座標）は変更できません'));
  children.push(space());
  children.push(h2('削除'));
  children.push(bullet('マイ投稿一覧から「削除」ボタンで投稿を削除できます'));
  children.push(bullet('確認ダイアログが表示されます'));
  children.push(bullet('削除は取り消せません'));
  children.push(space());
  children.push(h2('場所を変更したい場合'));
  children.push(p('投稿の場所（座標）は変更できません。場所を変更する場合は、該当の投稿を削除してから新しい場所で再投稿してください。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 8. カテゴリー
  children.push(h1('8. カテゴリーについて'));
  children.push(makeTable(
    ['カテゴリー', 'マーカー色', '対象例'],
    [
      ['環境', '緑', '不法投棄、樹木管理、公園の不具合、騒音問題など'],
      ['交通・道路', '青', '道路の陥没、白線消え、信号の故障、歩道の損傷など'],
      ['防犯', 'ピンク', '防犯灯の故障、不審者情報、見通しの悪い場所など'],
      ['防災', 'オレンジ', '崖崩れリスク、浸水リスク、避難経路の問題など'],
      ['その他', 'グレー', '上記に該当しないもの'],
    ],
    [1800, 1400, 5700]
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 9. 管理ステータス
  children.push(h1('9. 管理ステータスについて'));
  children.push(p('各投稿には管理者が設定するステータスがあり、対応の進捗状況を確認できます。'));
  children.push(space());
  children.push(makeTable(
    ['ステータス', '色', '意味'],
    [
      ['投稿', 'グレー', '投稿されたばかりの状態。管理者の確認前'],
      ['受付', '青', '管理者が投稿を確認し、受け付けた状態'],
      ['対応中', 'オレンジ', '関係機関に連絡するなど、対応を進めている状態'],
      ['解決', '緑', '問題が解決・改善された状態'],
    ],
    [1800, 1400, 5700]
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 10. FAQ
  children.push(h1('10. よくある質問'));
  const faqs = [
    ['パスワードはありますか？', 'パスワードは不要です。メールアドレスのみでログインします。'],
    ['写真は何枚添付できますか？', '1つの投稿に最大2枚まで添付できます。後から追加・削除も可能です。'],
    ['投稿の場所を変更できますか？', '場所の変更はできません。投稿を削除して新しい場所で再投稿してください。'],
    ['スマートフォンから使えますか？', 'はい。Safari、Chromeなどのブラウザからアクセスできます。'],
    ['投稿した情報は誰が見られますか？', '地図上の投稿内容は誰でも閲覧できます。ただし、本名・住所・電話番号は管理者のみ閲覧可能です。'],
    ['エリア外に投稿できますか？', '設定されたエリアの範囲外には投稿できません。エリアの変更は管理者が行います。'],
  ];
  faqs.forEach(([q, a]) => {
    children.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [bold(`Q: ${q}`)] }));
    children.push(p(`A: ${a}`));
  });

  return doc;
}

// ========================================
// 2. 管理者マニュアル
// ========================================
function createAdminManual() {
  const doc = baseDoc('街の安全安心マップ - 管理者マニュアル', '管理者マニュアル');
  const children = doc.sections[0].children;

  // 表紙
  children.push(space(), space(), space(), space());
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: '街の安全安心マップ', size: 48, bold: true, font: FONT, color: PRIMARY })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [new TextRun({ text: '管理者マニュアル', size: 36, font: FONT, color: '333333' })] }));
  children.push(space());
  children.push(new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `発行日: ${new Date().toLocaleDateString('ja-JP')}  |  バージョン: 1.0`, size: 20, font: FONT, color: GRAY })] }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 目次
  children.push(h1('目次'));
  ['管理者画面へのアクセス', 'ダッシュボード', '投稿管理', 'ユーザー管理', 'バックアップ', '設定', '印刷機能', '管理者アカウント管理', 'セキュリティに関する注意事項'].forEach((t, i) =>
    children.push(p(`${i + 1}. ${t}`))
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 1
  children.push(h1('1. 管理者画面へのアクセス'));
  children.push(p('管理者画面は /admin にアクセスしてログインします。'));
  children.push(space());
  children.push(h2('初期アカウント'));
  children.push(makeTable(
    ['項目', '値'],
    [['ユーザー名', 'admin'], ['パスワード', 'admin2024!change_me']],
    [3000, 6000]
  ));
  children.push(space());
  children.push(p('※ セキュリティのため、初回ログイン後にパスワードを変更してください。', { run: { color: 'F44336', bold: true } }));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 2
  children.push(h1('2. ダッシュボード'));
  children.push(p('ログイン後、ダッシュボードに統計情報が表示されます。'));
  children.push(bullet('総投稿数'));
  children.push(bullet('登録ユーザー数'));
  children.push(bullet('カテゴリー別投稿数（色分け表示）'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 3
  children.push(h1('3. 投稿管理'));
  children.push(p('「投稿管理」タブで全投稿の一覧を確認・管理できます。'));
  children.push(space());
  children.push(h2('フィルタリング'));
  children.push(bullet('カテゴリー別フィルター（環境/交通・道路/防犯/防災/その他）'));
  children.push(bullet('ステータス別フィルター（公開/非公開/対応済）'));
  children.push(space());
  children.push(h2('投稿の編集'));
  children.push(p('各投稿の「編集」ボタンから以下の項目を変更できます:'));
  children.push(bullet('カテゴリー'));
  children.push(bullet('タイトル'));
  children.push(bullet('詳細'));
  children.push(bullet('公開ステータス（公開/非公開/対応済）'));
  children.push(bullet('管理ステータス（投稿/受付/対応中/解決）'));
  children.push(bullet('管理メモ（最大2,000字）- 対応状況や備考を記録'));
  children.push(space());
  children.push(h2('投稿者情報の閲覧'));
  children.push(p('投稿一覧の投稿者名をクリックすると、投稿者の全情報が表示されます:'));
  children.push(bullet('表示名、本名、メールアドレス、住所、電話番号'));
  children.push(bullet('登録日'));
  children.push(bullet('その投稿者の全投稿一覧'));
  children.push(space());
  children.push(h2('投稿の削除'));
  children.push(p('「削除」ボタンで投稿を削除できます。確認ダイアログが表示されます。この操作は取り消せません。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 4
  children.push(h1('4. ユーザー管理'));
  children.push(p('「ユーザー管理」タブで登録ユーザーの一覧と管理ができます。'));
  children.push(space());
  children.push(h2('一覧表示'));
  children.push(p('各ユーザーの表示名、本名、メールアドレス、電話番号、投稿数、登録日が表示されます。'));
  children.push(space());
  children.push(h2('ユーザーの編集'));
  children.push(p('「編集」ボタンから表示名、本名、住所、電話番号を変更できます。'));
  children.push(space());
  children.push(h2('ユーザーの削除'));
  children.push(p('「削除」ボタンでユーザーを削除できます。ユーザーの全投稿も同時に削除されます。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 5
  children.push(h1('5. バックアップ'));
  children.push(p('「バックアップ」タブからデータをCSV形式でダウンロードできます。'));
  children.push(space());
  children.push(h2('投稿データバックアップ'));
  children.push(p('以下の条件でフィルタリングしてダウンロードできます:'));
  children.push(bullet('カテゴリー'));
  children.push(bullet('ステータス'));
  children.push(bullet('日付範囲（開始日〜終了日）'));
  children.push(bullet('個別投稿の選択（チェックボックス）'));
  children.push(space());
  children.push(h3('CSVの列項目'));
  children.push(makeTable(
    ['列名', '内容'],
    [
      ['ID', '投稿の一意識別子'],
      ['カテゴリー', '環境/交通・道路/防犯/防災/その他'],
      ['タイトル', '投稿のタイトル'],
      ['詳細', '投稿の説明文'],
      ['住所', '自動取得された住所'],
      ['公開ステータス', '公開/非公開/対応済'],
      ['管理ステータス', '投稿/受付/対応中/解決'],
      ['管理メモ', '管理者が記入したメモ'],
      ['緯度・経度', '座標データ'],
      ['Googleマップ座標', 'Googleマップで使用可能な座標'],
      ['投稿者情報', '表示名、本名、電話番号'],
      ['写真URL', '写真1、写真2のURL'],
      ['日時', '投稿日時、更新日時'],
    ],
    [2500, 6500]
  ));
  children.push(space());
  children.push(h2('ユーザーデータバックアップ'));
  children.push(p('全ユーザーのID、メール、表示名、本名、住所、電話番号、登録日をCSVでダウンロードできます。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 6
  children.push(h1('6. 設定'));
  children.push(h2('地図エリア設定'));
  children.push(p('地図の表示範囲と投稿可能エリアをプリセットから選択できます。'));
  children.push(makeTable(
    ['プリセット', '中心座標', 'ズームレベル'],
    [
      ['戸塚区・泉区', '35.3950, 139.5330', '14'],
      ['横浜市', '35.4437, 139.6380', '12'],
      ['川崎市', '35.5309, 139.7030', '12'],
      ['相模原市', '35.5714, 139.3734', '12'],
      ['神奈川県', '35.4478, 139.3425', '10'],
      ['東京都', '35.6812, 139.7671', '11'],
      ['全国', '36.5, 138.0', '6'],
    ],
    [2500, 3500, 3000]
  ));
  children.push(space());
  children.push(h2('データ初期化'));
  children.push(p('データの初期化は2種類あります。いずれも取り消し不可です。事前にバックアップを取ってください。'));
  children.push(bullet('投稿データの初期化: 全投稿を削除（ユーザーデータは保持）'));
  children.push(bullet('全データの初期化: 全ユーザーと全投稿を削除'));
  children.push(p('実行時に確認コードの入力が求められます。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 7
  children.push(h1('7. 印刷機能'));
  children.push(p('投稿管理タブの各投稿に「印刷」ボタンがあります。A4サイズのカードとして出力できます。'));
  children.push(space());
  children.push(h2('印刷カードの内容'));
  children.push(bullet('ヘッダー: アプリ名、カテゴリーバッジ、管理ステータスバッジ'));
  children.push(bullet('タイトル（大文字・太字）'));
  children.push(bullet('住所'));
  children.push(bullet('投稿の詳細説明'));
  children.push(bullet('周辺地図（Leafletで描画、マーカー付き）'));
  children.push(bullet('添付写真（最大2枚）'));
  children.push(bullet('管理メモ（概要300字）'));
  children.push(bullet('投稿者情報、座標、Googleマップリンク'));
  children.push(bullet('投稿ID、印刷日'));
  children.push(space());
  children.push(p('「印刷」ボタンをクリックすると印刷プレビューが表示されます。内容を確認後、「印刷」ボタンで出力します。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 8
  // 8. 管理者アカウント管理
  children.push(h1('8. 管理者アカウント管理'));
  children.push(p('「設定」タブの「管理者アカウント管理」セクションで、管理者アカウントの追加・削除・パスワード変更ができます。'));
  children.push(space());
  children.push(h2('自分のパスワード変更'));
  children.push(numbered('設定タブの「管理者アカウント管理」セクションを開く'));
  children.push(numbered('「現在のパスワード」に今のパスワードを入力'));
  children.push(numbered('「新しいパスワード」に変更後のパスワードを入力（8文字以上）'));
  children.push(numbered('「変更」ボタンをクリック'));
  children.push(space());
  children.push(h2('新しい管理者の追加'));
  children.push(numbered('ユーザー名、パスワード（8文字以上）、表示名を入力'));
  children.push(numbered('「追加」ボタンをクリック'));
  children.push(p('※ ユーザー名は重複できません。'));
  children.push(space());
  children.push(h2('他の管理者のパスワード変更'));
  children.push(p('管理者一覧の「PW変更」ボタンから他の管理者のパスワードをリセットできます。'));
  children.push(space());
  children.push(h2('管理者の削除'));
  children.push(bullet('管理者一覧の「削除」ボタンで管理者アカウントを削除できます'));
  children.push(bullet('自分自身のアカウントは削除できません'));
  children.push(bullet('最後の管理者アカウントは削除できません'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(h1('9. セキュリティに関する注意事項'));
  children.push(bullet('管理者パスワードは初回ログイン後に必ず変更してください'));
  children.push(bullet('管理者画面のURLを一般ユーザーに共有しないでください'));
  children.push(bullet('バックアップCSVには個人情報が含まれます。取り扱いにご注意ください'));
  children.push(bullet('メールアドレスはシステム内で暗号化されています'));
  children.push(bullet('定期的なバックアップを推奨します'));

  return doc;
}

// ========================================
// 3. システム仕様書
// ========================================
function createSpecDoc() {
  const doc = baseDoc('街の安全安心マップ - システム仕様書', 'システム仕様書');
  const children = doc.sections[0].children;

  // 表紙
  children.push(space(), space(), space(), space());
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: '街の安全安心マップ', size: 48, bold: true, font: FONT, color: PRIMARY })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [new TextRun({ text: 'システム仕様書', size: 36, font: FONT, color: '333333' })] }));
  children.push(space());
  children.push(new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `発行日: ${new Date().toLocaleDateString('ja-JP')}  |  バージョン: 1.0`, size: 20, font: FONT, color: GRAY })] }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 1
  children.push(h1('1. システム概要'));
  children.push(p('地域の安心安全に関する情報を地図上で投稿・共有するWebアプリケーション。市民が地域の課題を報告し、管理者が対応状況を管理する。'));
  children.push(space());
  children.push(makeTable(
    ['項目', '内容'],
    [
      ['アプリケーション名', '街の安全安心マップ'],
      ['種別', 'Webアプリケーション（SPA）'],
      ['対応デバイス', 'PC、タブレット、スマートフォン'],
      ['対応ブラウザ', 'Safari, Chrome, Edge, Firefox'],
      ['URL構成', 'メイン画面: / , 管理者画面: /admin'],
    ],
    [3000, 6000]
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 2
  children.push(h1('2. 技術スタック'));
  children.push(makeTable(
    ['レイヤー', '技術', 'バージョン/備考'],
    [
      ['サーバー', 'Node.js + Express', 'Express 4.18'],
      ['データベース', 'SQLite', 'better-sqlite3 (WAL mode)'],
      ['地図', 'Leaflet.js', 'v1.9.4 + OpenStreetMap'],
      ['マーカー', 'Leaflet.markercluster', 'v1.5.3'],
      ['写真保存', 'Cloudinary', '無料プラン / ローカルフォールバック'],
      ['認証', 'bcryptjs + UUID v4', 'セッショントークン方式'],
      ['メール暗号化', 'AES-256-CBC', 'scrypt鍵導出'],
      ['セキュリティ', 'Helmet, express-rate-limit', 'CSP無効（Leaflet互換）'],
      ['入力サニタイズ', 'sanitize-html', 'XSS防止'],
      ['デプロイ', 'Render', 'Web Service (Node)'],
      ['ソース管理', 'GitHub', 'yamazakimakoto/safety-map'],
    ],
    [2000, 3500, 3500]
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 3
  children.push(h1('3. データベース設計'));
  children.push(h2('3.1 usersテーブル'));
  children.push(makeTable(
    ['カラム', '型', '制約', '説明'],
    [
      ['id', 'TEXT', 'PRIMARY KEY', 'UUID v4'],
      ['email_hash', 'TEXT', 'UNIQUE, NOT NULL', 'SHA-256ハッシュ（検索用）'],
      ['email_encrypted', 'TEXT', 'NOT NULL', 'AES-256-CBC暗号化メール'],
      ['display_name', 'TEXT', 'NOT NULL', '表示名（50文字以内）'],
      ['real_name', 'TEXT', 'DEFAULT ""', '本名（任意）'],
      ['address', 'TEXT', 'DEFAULT ""', '住所（任意）'],
      ['phone', 'TEXT', 'DEFAULT ""', '電話番号（任意）'],
      ['session_token', 'TEXT', '', 'セッショントークン（UUID v4）'],
      ['is_admin', 'INTEGER', 'DEFAULT 0', '管理者フラグ'],
      ['created_at', 'TIMESTAMP', 'DEFAULT CURRENT_TIMESTAMP', '登録日時'],
    ],
    [2000, 1200, 2500, 3300]
  ));
  children.push(space());
  children.push(h2('3.2 reportsテーブル'));
  children.push(makeTable(
    ['カラム', '型', '制約', '説明'],
    [
      ['id', 'TEXT', 'PRIMARY KEY', 'UUID v4'],
      ['user_id', 'TEXT', 'FOREIGN KEY', '投稿者のユーザーID'],
      ['latitude', 'REAL', 'NOT NULL', '緯度'],
      ['longitude', 'REAL', 'NOT NULL', '経度'],
      ['address', 'TEXT', 'DEFAULT ""', '自動取得住所（Nominatim）'],
      ['category', 'TEXT', 'NOT NULL', 'カテゴリー（5種）'],
      ['title', 'TEXT', 'NOT NULL', 'タイトル'],
      ['description', 'TEXT', 'DEFAULT ""', '詳細説明'],
      ['photo1_url', 'TEXT', 'DEFAULT ""', '写真1のURL'],
      ['photo2_url', 'TEXT', 'DEFAULT ""', '写真2のURL'],
      ['status', 'TEXT', 'DEFAULT "published"', '公開ステータス'],
      ['admin_status', 'TEXT', 'DEFAULT "投稿"', '管理ステータス（4段階）'],
      ['admin_memo', 'TEXT', 'DEFAULT ""', '管理メモ（2000字）'],
      ['created_at', 'TIMESTAMP', 'DEFAULT CURRENT_TIMESTAMP', '投稿日時'],
      ['updated_at', 'TIMESTAMP', 'DEFAULT CURRENT_TIMESTAMP', '更新日時'],
    ],
    [2000, 1200, 2500, 3300]
  ));
  children.push(space());
  children.push(h2('3.3 adminsテーブル'));
  children.push(makeTable(
    ['カラム', '型', '制約', '説明'],
    [
      ['id', 'TEXT', 'PRIMARY KEY', 'UUID v4'],
      ['username', 'TEXT', 'UNIQUE, NOT NULL', 'ログイン名'],
      ['password_hash', 'TEXT', 'NOT NULL', 'bcryptハッシュ'],
      ['display_name', 'TEXT', 'NOT NULL', '管理者表示名'],
      ['created_at', 'TIMESTAMP', 'DEFAULT CURRENT_TIMESTAMP', '作成日時'],
    ],
    [2000, 1200, 2500, 3300]
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 4
  children.push(h1('4. API仕様'));
  children.push(h2('4.1 認証API (/api/auth)'));
  children.push(makeTable(
    ['メソッド', 'エンドポイント', '認証', '機能'],
    [
      ['POST', '/register', 'なし', 'ユーザー登録'],
      ['POST', '/login', 'なし', 'ログイン（メールのみ）'],
      ['GET', '/profile', 'x-user-token', 'プロフィール取得'],
      ['PUT', '/profile', 'x-user-token', 'プロフィール更新'],
      ['POST', '/admin/login', 'なし', '管理者ログイン'],
      ['POST', '/admin/change-password', 'x-admin-token', '管理者パスワード変更'],
    ],
    [1200, 2200, 2000, 3600]
  ));
  children.push(space());
  children.push(h2('4.2 投稿API (/api/reports)'));
  children.push(makeTable(
    ['メソッド', 'エンドポイント', '認証', '機能'],
    [
      ['GET', '/', 'なし', '全投稿取得（公開のみ）'],
      ['GET', '/area', 'なし', 'エリア設定取得'],
      ['GET', '/my', 'x-user-token', '自分の投稿一覧'],
      ['GET', '/:id', 'なし', '投稿詳細取得'],
      ['POST', '/', 'x-user-token', '新規投稿（multipart）'],
      ['PUT', '/:id', 'x-user-token', '自分の投稿を編集'],
      ['DELETE', '/:id', 'x-user-token', '自分の投稿を削除'],
    ],
    [1200, 2200, 2000, 3600]
  ));
  children.push(space());
  children.push(h2('4.3 管理者API (/api/admin)'));
  children.push(p('全て x-admin-token ヘッダーが必要'));
  children.push(makeTable(
    ['メソッド', 'エンドポイント', '機能'],
    [
      ['GET', '/reports', '全投稿取得（投稿者詳細付き）'],
      ['GET', '/reports/:id', '投稿詳細（投稿者全情報付き）'],
      ['PUT', '/reports/:id', '投稿編集（ステータス・メモ含む）'],
      ['DELETE', '/reports/:id', '投稿削除'],
      ['GET', '/users', 'ユーザー一覧（投稿数付き）'],
      ['GET', '/users/:id', 'ユーザー詳細（全投稿付き）'],
      ['PUT', '/users/:id', 'ユーザー編集'],
      ['DELETE', '/users/:id', 'ユーザー削除（投稿も連鎖削除）'],
      ['GET', '/backup/reports', '投稿CSVエクスポート'],
      ['GET', '/backup/users', 'ユーザーCSVエクスポート'],
      ['GET', '/stats', '統計情報'],
      ['GET', '/area', 'エリア設定取得'],
      ['PUT', '/area', 'エリア変更'],
      ['DELETE', '/reset/reports', '投稿データ初期化'],
      ['DELETE', '/reset/users', '全データ初期化'],
      ['GET', '/admins', '管理者一覧'],
      ['POST', '/admins', '管理者追加'],
      ['DELETE', '/admins/:id', '管理者削除'],
      ['PUT', '/admins/:id/reset-password', '管理者パスワードリセット'],
    ],
    [1200, 3000, 4800]
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 5
  children.push(h1('5. セキュリティ'));
  children.push(h2('認証方式'));
  children.push(bullet('一般ユーザー: メールアドレスベース認証（パスワード不要）'));
  children.push(bullet('管理者: ユーザー名 + パスワード（bcryptハッシュ）'));
  children.push(bullet('セッション管理: UUID v4トークン（localStorageに保存）'));
  children.push(space());
  children.push(h2('データ保護'));
  children.push(bullet('メールアドレス: SHA-256ハッシュ（検索用）+ AES-256-CBC暗号化（保存用）'));
  children.push(bullet('パスワード: bcryptハッシュ（ソルト付き、コスト10）'));
  children.push(bullet('入力値: sanitize-htmlによるXSS防止'));
  children.push(bullet('SQL: パラメータ化クエリ（SQLインジェクション防止）'));
  children.push(space());
  children.push(h2('通信・アクセス制御'));
  children.push(bullet('Helmet.jsによるHTTPヘッダー保護'));
  children.push(bullet('APIレート制限: 15分あたり100リクエスト'));
  children.push(bullet('投稿のエリア制限（バウンディングボックス検証）'));
  children.push(bullet('ファイルアップロード: 5MB制限、画像形式のみ'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 6
  children.push(h1('6. 外部サービス連携'));
  children.push(h2('OpenStreetMap / Leaflet.js'));
  children.push(p('地図表示にLeaflet.jsとOpenStreetMapタイルを使用。CDN経由で読み込み。'));
  children.push(space());
  children.push(h2('Nominatim（逆ジオコーディング）'));
  children.push(p('投稿時に座標から住所を自動取得。OpenStreetMapのNominatim APIを使用。利用規約に基づきUser-Agentを設定。'));
  children.push(space());
  children.push(h2('Cloudinary（写真保存）'));
  children.push(p('写真のクラウド保存。無料プラン（25GBストレージ、25GB帯域/月）。環境変数で設定。未設定時はサーバーローカルに保存（Render再起動で消失）。'));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 7
  children.push(h1('7. デプロイ構成'));
  children.push(makeTable(
    ['項目', '設定'],
    [
      ['ホスティング', 'Render (Web Service)'],
      ['ランタイム', 'Node.js'],
      ['ビルドコマンド', 'npm install'],
      ['起動コマンド', 'node server.js'],
      ['リージョン', 'Singapore'],
      ['ソースコード', 'GitHub (yamazakimakoto/safety-map)'],
      ['自動デプロイ', 'mainブランチへのpush時'],
    ],
    [3000, 6000]
  ));
  children.push(space());
  children.push(h2('環境変数'));
  children.push(makeTable(
    ['変数名', '必須', '説明'],
    [
      ['PORT', 'いいえ', 'サーバーポート（デフォルト: 3000）'],
      ['ENCRYPTION_KEY', 'はい', 'メール暗号化キー'],
      ['CLOUDINARY_CLOUD_NAME', 'いいえ', 'Cloudinaryクラウド名'],
      ['CLOUDINARY_API_KEY', 'いいえ', 'Cloudinary APIキー'],
      ['CLOUDINARY_API_SECRET', 'いいえ', 'Cloudinary APIシークレット'],
    ],
    [3500, 1000, 4500]
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 8
  children.push(h1('8. ファイル構成'));
  const files = [
    ['server.js', 'Expressサーバー、ルーティング設定'],
    ['database.js', 'SQLiteセットアップ、スキーマ定義、マイグレーション'],
    ['routes/auth.js', '認証API（登録、ログイン、プロフィール）'],
    ['routes/reports.js', '投稿API（CRUD、エリア設定、逆ジオコーディング）'],
    ['routes/admin.js', '管理者API（投稿/ユーザー管理、バックアップ、統計）'],
    ['middleware/auth.js', '認証ミドルウェア（ユーザー/管理者）'],
    ['public/index.html', 'メイン画面HTML'],
    ['public/admin.html', '管理者画面HTML'],
    ['public/css/style.css', 'スタイルシート（レスポンシブ対応）'],
    ['public/js/app.js', 'メイン画面JavaScript'],
    ['public/js/admin.js', '管理者画面JavaScript'],
    ['render.yaml', 'Renderデプロイ設定'],
    ['.env.example', '環境変数テンプレート'],
  ];
  children.push(makeTable(
    ['ファイル', '説明'],
    files,
    [3500, 5500]
  ));

  return doc;
}

// ========================================
// 生成実行
// ========================================
async function main() {
  const outputDir = path.join(__dirname);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const docs = [
    { name: 'ユーザーマニュアル.docx', fn: createUserManual },
    { name: '管理者マニュアル.docx', fn: createAdminManual },
    { name: 'システム仕様書.docx', fn: createSpecDoc },
  ];

  for (const { name, fn } of docs) {
    const doc = new Document(fn());
    const buffer = await Packer.toBuffer(doc);
    const filePath = path.join(outputDir, name);
    fs.writeFileSync(filePath, buffer);
    console.log(`生成完了: ${filePath}`);
  }
}

main().catch(console.error);
