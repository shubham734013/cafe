import React from 'react';
import type { CafeAssistantContext } from '../utils/cafeAssistant';
import { VishalAiAssistant } from './VishalAiAssistant';

export interface CafeAssistantChatProps {
  context?: CafeAssistantContext;
  mode?: 'embedded' | 'dialog';
  isLoading?: boolean;
  contextError?: string;
  onRetryContext?: () => void;
  onClose: () => void;
}

export const CafeAssistantChat: React.FC<CafeAssistantChatProps> = ({
  context,
  onClose,
}) => {
  return (
    <VishalAiAssistant
      mode="embedded"
      context={context}
      onClose={onClose}
    />
  );
};
