export interface AuthUser {
  id: string;
  name: string;
  email: string;
  businessId: string;
  businessName: string;
}

export interface AuthenticatedPrincipal {
  id: string;
  businessId: string;
  sessionId: string;
}

export interface AccessClaims {
  sub: string;
  businessId: string;
  sid: string;
  typ: 'access';
}

export interface RefreshClaims {
  sub: string;
  businessId: string;
  sid: string;
  typ: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: AuthUser;
}
