import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import {
  addCustomerSchema,
  addIngredientSchema,
  addLoyaltyRuleSchema,
  addMenuItemSchema,
  updateMenuItemSchema,
  addStaffSchema,
  addTableSchema,
  cafeSettingsSchema,
  customerFeedbackSchema,
  createCampaignSchema,
  createOrderSchema,
  reserveTableSchema,
  restockIngredientSchema,
  staffPinLoginSchema,
  tableTransferMergeSchema,
  toggleKotItemSchema,
  orderFeedbackSchema,
  orderRefundSchema,
  cancelOrderItemSchema,
  orderPayCounterSchema,
  requestReorderSchema,
  stockReceiptSchema,
  stockWasteSchema,
  stockTransferSchema,
  stockCountSchema,
  purchaseOrderSchema,
  receivePurchaseOrderSchema,
  brevoConfirmationSchema,
  broadcastEmailSchema,
  sendBillEmailSchema,
} from '../shared/schemas';
import {
  isBrevoConfigured,
  sendBrevoConfirmationEmail,
  broadcastBrevoMarketingEmail,
  sendBrevoOrderBillEmail,
  sendBrevoOrderPaidEmail,
} from './brevo';
import {
  assertAuthSecretConfigured,
  authenticateStaffPin,
  canCustomerAccessCustomer,
  canCustomerAccessOrder,
  clearCustomerSessionCookie,
  clearStaffSessionCookie,
  getCustomerSession,
  getStaffSession,
  getStaffSessionFromCookieHeader,
  hasStaffRole,
  issueOrUpdateCustomerSessionCookie,
  setStaffSessionCookie,
  setStaffRefreshTokenCookie,
  clearStaffRefreshTokenCookie,
  rotateRefreshToken,
  checkLockout,
  createRefreshToken,
  STAFF_REFRESH_COOKIE,
  parseCookies,
  updateCustomerCrmIdentityCookie,
  type StaffSessionPayload,
} from './auth';
import { requestOtp, verifyOtp } from './otp';
import {
  consumePasswordResetToken,
  verifyAndApplyEmailChange,
  generateOAuthChallenge,
  verifyOAuthCallbackState,
} from './accountSecurity';
import {
  setupAdmin2Fa,
  confirmAndEnableAdmin2Fa,
  verifyAdmin2Fa,
  isAdmin2FaRequired,
} from './admin2fa';
import { createRateLimiter, createTableRateLimiter } from './rateLimit';
import { noSqlInjectionSanitizer, safeJsonForHtml, verifyCaptchaToken } from './security';
import { InvalidDomainTransitionError } from '../state/cafeStateMachines';
import type { ScreenId, StaffRole } from '../types/cafe';
import { cafeOpenApiSpec } from './openapi';
import { CafeStore } from './store';
import {
  UpiGateway,
  UpiGatewayRequestError,
  verifyUpiGatewayWebhook,
  type UpiGatewayClient,
  type UpiGatewayOrder,