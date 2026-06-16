export interface GeneratePdfsRequest {
  codEmp: number;
  codSed: number;
  codTCl: number;
  numOrd: number;
  idAten: string;
  codCli: number;
  emiAfi: boolean;
  incExp: boolean;
  codDCo?: number | null;
  outputDir?: string;
  user: string;
  pass: string;
  strict?: boolean;
}

export interface GeneratePdfsResponse {
  success: boolean;
  message: string;
  exitCode?: number;
  generatedCount?: number;
  failedCount?: number;
  skippedCount?: number;
}
