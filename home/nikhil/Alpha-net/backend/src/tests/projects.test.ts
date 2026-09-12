  describe('addTeamMember', () => {
    it('adds a team member to project', async () => {
      const projectId = new ObjectId()
      const userId = new ObjectId()
      const managerId = new ObjectId()
      const project = {
        _id: projectId,
        name: 'Test Project',
        managerId,
        supervisorId: null,
        teamMemberIds: [],
        documentIds: [],
        status: 'draft',
      }
      mockDb.collection.mockReturnValue(createMockCollection([project]))

      const result = await addTeamMember(projectId.toString(), userId.toString())
      expect(result).not.toBeNull()
    })
  })

  describe('removeTeamMember', () => {
    it('removes a team member from project', async () => {
      const projectId = new ObjectId()
      const userId = new ObjectId()
      const managerId = new ObjectId()
      const project = {
        _id: projectId,
        name: 'Test Project',
        managerId,
        supervisorId: null,
        teamMemberIds: [userId],
        documentIds: [],
        status: 'draft',
      }
      mockDb.collection.mockReturnValue(createMockCollection([project]))

      const result = await removeTeamMember(projectId.toString(), userId.toString())
      expect(result).not.toBeNull()
    })
  })