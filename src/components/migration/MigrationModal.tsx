import React, { useState, useEffect } from 'react'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Progress
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'
import { MigrationService, MigrationProgress } from '../../services/migrationService'

interface MigrationModalProps {
  isOpen: boolean
  onClose: () => void
  onMigrationComplete: () => void
  onNeverShowAgain?: () => void
}

export const MigrationModal: React.FC<MigrationModalProps> = ({
  isOpen,
  onClose,
  onMigrationComplete,
  onNeverShowAgain
}) => {
  const [migrationSummary, setMigrationSummary] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null)
  const [migrationCompleted, setMigrationCompleted] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadMigrationSummary()
    }
  }, [isOpen])

  const loadMigrationSummary = async () => {
    try {
      const summary = await MigrationService.getMigrationSummary()
      setMigrationSummary(summary)
    } catch (error) {
      }
  }

  const handleStartMigration = async () => {
    setIsLoading(true)
    setMigrationError(null)
    setMigrationCompleted(false)

    const { success, error } = await MigrationService.migrateToSupabase((progress) => {
      setMigrationProgress(progress)
      if (progress.completed) {
        setMigrationCompleted(true)
        setIsLoading(false)
      }
      if (progress.error) {
        setMigrationError(progress.error)
        setIsLoading(false)
      }
    })

    if (!success && error) {
      setMigrationError(error)
      setIsLoading(false)
    }
  }

  const handleComplete = () => {
    onMigrationComplete()
    onClose()
  }

  const progressPercentage = migrationProgress
    ? Math.round((migrationProgress.current / migrationProgress.total) * 100)
    : 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      isDismissable={!isLoading}
      hideCloseButton={isLoading}
      classNames={{
        base: "bg-transparent",
        backdrop: "bg-black/50 backdrop-blur-md",
        wrapper: "items-center justify-center",
        body: "p-0",
        header: "p-0",
        footer: "p-0"
      }}
    >
      <ModalContent className="bg-white dark:bg-black border border-gray-200 dark:border-gray-700 shadow-2xl">
        <ModalHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-foreground/5 rounded-full flex items-center justify-center">
                <Icon icon="lucide:cloud-upload" className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  Migrate to Cloud Storage
                </h2>
                <p className="text-xs text-foreground/60 mt-0.5">
                  Move your trading data to secure cloud storage
                </p>
              </div>
            </div>
            {!isLoading && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center transition-colors"
              >
                <Icon icon="lucide:x" className="w-4 h-4 text-foreground/60" />
              </button>
            )}
          </div>
        </ModalHeader>

        <ModalBody className="px-6 py-0">
          <AnimatePresence mode="wait">
            {!migrationCompleted && !migrationError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                {migrationSummary && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-foreground mb-3">Data to be migrated:</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-3 bg-foreground/3 rounded-lg">
                      <span className="text-sm text-foreground/80">Trades</span>
                      <span className="text-sm font-medium text-foreground bg-foreground/10 px-2 py-1 rounded-full">
                        {migrationSummary.trades}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-foreground/3 rounded-lg">
                      <span className="text-sm text-foreground/80">Chart Images</span>
                      <span className="text-sm font-medium text-foreground bg-foreground/10 px-2 py-1 rounded-full">
                        {migrationSummary.chartImages}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-foreground/3 rounded-lg">
                      <span className="text-sm text-foreground/80">User Preferences</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        migrationSummary.hasPreferences
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-foreground/10 text-foreground/60'
                      }`}>
                        {migrationSummary.hasPreferences ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-foreground/3 rounded-lg">
                      <span className="text-sm text-foreground/80">Portfolio Data</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        migrationSummary.hasPortfolioData
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-foreground/10 text-foreground/60'
                      }`}>
                        {migrationSummary.hasPortfolioData ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Features */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <Icon icon="lucide:shield-check" className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-foreground">Secure & Private</span>
                    <p className="text-xs text-foreground/60">Your data is encrypted and only accessible by you</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <Icon icon="lucide:refresh-cw" className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-foreground">Automatic Sync</span>
                    <p className="text-xs text-foreground/60">Access your data from any device, always up to date</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <Icon icon="lucide:hard-drive" className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-foreground">Backup & Recovery</span>
                    <p className="text-xs text-foreground/60">Never lose your trading data with automatic backups</p>
                  </div>
                </div>
              </div>

              {migrationProgress && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 mt-4 pt-4 border-t border-foreground/10"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Migration Progress</span>
                      <span className="text-sm font-medium text-foreground">{progressPercentage}%</span>
                    </div>
                    <div className="relative">
                      <Progress
                        value={progressPercentage}
                        className="mb-2"
                        classNames={{
                          base: "max-w-full",
                          track: "bg-foreground/10",
                          indicator: "bg-foreground"
                        }}
                      />
                    </div>
                    <p className="text-xs text-foreground/60">
                      {migrationProgress.message}
                    </p>
                  </div>
                </motion.div>
              )}
              </motion.div>
            )}

            {migrationCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon icon="lucide:check-circle" className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Migration Completed!</h3>
              <p className="text-sm text-foreground/60 mb-4">
                Your trading data has been successfully migrated to cloud storage.
              </p>
              <div className="inline-flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                All data migrated successfully
              </div>
            </motion.div>
          )}

          {migrationError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon icon="lucide:alert-circle" className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Migration Failed</h3>
              <p className="text-sm text-foreground/60 mb-4">
                {migrationError}
              </p>
              <div className="inline-flex items-center px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
                Please try again or contact support
              </div>
            </motion.div>
            )}
          </AnimatePresence>
        </ModalBody>

        <ModalFooter className="px-6 pb-6 pt-0">
          <div className="flex items-center justify-between pt-6 border-t border-foreground/10 w-full">
            {!migrationCompleted && !migrationError && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-foreground/60 hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  {onNeverShowAgain && (
                    <button
                      onClick={onNeverShowAgain}
                      disabled={isLoading}
                      className="px-4 py-2 text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Never show again
                    </button>
                  )}
                </div>
                <button
                  onClick={handleStartMigration}
                  disabled={isLoading}
                  className="px-6 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      <Icon icon="lucide:cloud-upload" className="w-4 h-4" />
                      Start Migration
                    </>
                  )}
                </button>
              </>
            )}

            {migrationCompleted && (
              <button
                onClick={handleComplete}
                className="w-full px-6 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
              >
                <Icon icon="lucide:arrow-right" className="w-4 h-4" />
                Continue to App
              </button>
            )}

            {migrationError && (
              <div className="flex gap-2 w-full">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setMigrationError(null)
                    setMigrationProgress(null)
                  }}
                  className="flex-1 px-6 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Icon icon="lucide:refresh-cw" className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            )}
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
