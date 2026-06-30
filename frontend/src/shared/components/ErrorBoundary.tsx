import React, { Component, ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="页面渲染异常"
          subTitle={this.state.error?.message || '发生了未知错误'}
          extra={
            <Button type="primary" onClick={() => this.setState({ hasError: false, error: null })}>
              重新加载
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
