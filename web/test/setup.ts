// jsdom không có ResizeObserver, mà ResponsiveContainer của Recharts cần nó để đo khung.
// Bản giả không đo gì: test chỉ kiểm phần điều khiển quanh biểu đồ, không kiểm hình vẽ.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
